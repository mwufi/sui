// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { TransactionBlock } from '@mysten/sui.js/transactions';
import { toB64 } from '@mysten/sui.js/utils';
import type {
	SuiSignAndExecuteTransactionBlockV2Input,
	SuiSignAndExecuteTransactionBlockV2Output,
} from '@mysten/wallet-standard';
import type { UseMutationOptions, UseMutationResult } from '@tanstack/react-query';
import { useMutation } from '@tanstack/react-query';

import { walletMutationKeys } from '../../constants/walletMutationKeys.js';
import {
	WalletFeatureNotSupportedError,
	WalletNoAccountSelectedError,
	WalletNotConnectedError,
} from '../../errors/walletErrors.js';
import type { PartialBy } from '../../types/utilityTypes.js';
import { useSuiClient } from '../useSuiClient.js';
import { useCurrentAccount } from './useCurrentAccount.js';
import { useCurrentWallet } from './useCurrentWallet.js';

type UseSignAndExecuteTransactionBlockArgs = PartialBy<
	Omit<SuiSignAndExecuteTransactionBlockV2Input, 'transactionBlock'>,
	'account' | 'chain'
> & {
	transactionBlock: TransactionBlock;
};

type UseSignAndExecuteTransactionBlockResult = SuiSignAndExecuteTransactionBlockV2Output;

type UseSignAndExecuteTransactionBlockError =
	| WalletFeatureNotSupportedError
	| WalletNoAccountSelectedError
	| WalletNotConnectedError
	| Error;

type UseSignAndExecuteTransactionBlockMutationOptions = Omit<
	UseMutationOptions<
		UseSignAndExecuteTransactionBlockResult,
		UseSignAndExecuteTransactionBlockError,
		UseSignAndExecuteTransactionBlockArgs,
		unknown
	>,
	'mutationFn'
> & {
	executeFromWallet?: boolean;
};

/**
 * Mutation hook for prompting the user to sign and execute a transaction block.
 */
export function useSignAndExecuteTransactionBlock({
	mutationKey,
	executeFromWallet,
	...mutationOptions
}: UseSignAndExecuteTransactionBlockMutationOptions = {}): UseMutationResult<
	UseSignAndExecuteTransactionBlockResult,
	UseSignAndExecuteTransactionBlockError,
	UseSignAndExecuteTransactionBlockArgs
> {
	const { currentWallet, supportedIntents } = useCurrentWallet();
	const currentAccount = useCurrentAccount();
	const client = useSuiClient();

	return useMutation({
		mutationKey: walletMutationKeys.signAndExecuteTransactionBlock(mutationKey),
		mutationFn: async ({ transactionBlock, ...signTransactionBlockArgs }) => {
			if (!currentWallet) {
				throw new WalletNotConnectedError('No wallet is connected.');
			}

			const signerAccount = signTransactionBlockArgs.account ?? currentAccount;
			if (!signerAccount) {
				throw new WalletNoAccountSelectedError(
					'No wallet account is selected to sign and execute the transaction block with.',
				);
			}

			const shouldExecuteFromWallet =
				executeFromWallet ||
				(executeFromWallet === undefined &&
					currentWallet.features['sui:signAndExecuteTransactionBlock:v2']);

			if (shouldExecuteFromWallet) {
				const walletFeature = currentWallet.features['sui:signAndExecuteTransactionBlock:v2'];
				if (!walletFeature) {
					throw new WalletFeatureNotSupportedError(
						"This wallet doesn't support the `signAndExecuteTransactionBlock` feature.",
					);
				}

				return walletFeature.signAndExecuteTransactionBlock({
					...signTransactionBlockArgs,
					transactionBlock: await transactionBlock.toJSON({
						supportedIntents,
						client,
					}),
					account: signerAccount,
					chain: signTransactionBlockArgs.chain ?? signerAccount.chains[0],
				});
			}

			const walletFeature = currentWallet.features['sui:signTransactionBlock:v2'];
			if (!walletFeature) {
				throw new WalletFeatureNotSupportedError(
					"This wallet doesn't support the `signTransactionBlock` feature.",
				);
			}

			const { signature, bytes } = await walletFeature.signTransactionBlock({
				...signTransactionBlockArgs,
				transactionBlock: await transactionBlock.toJSON({
					supportedIntents,
					client,
				}),
				account: signerAccount,
				chain: signTransactionBlockArgs.chain ?? signerAccount.chains[0],
			});

			const { rawEffects, balanceChanges, digest } = await client.executeTransactionBlock({
				transactionBlock: bytes,
				signature,
				options: {
					showRawEffects: true,
					showBalanceChanges: true,
				},
			});

			console.log({
				rawEffects,
				balanceChanges,
				digest,
			});

			return {
				digest,
				bytes,
				signature,
				effects: toB64(new Uint8Array(rawEffects!)),
				balanceChanges:
					balanceChanges?.map(({ coinType, amount, owner }) => {
						const address =
							(owner as Extract<typeof owner, { AddressOwner: unknown }>).AddressOwner ??
							(owner as Extract<typeof owner, { ObjectOwner: unknown }>).ObjectOwner;

						return {
							coinType,
							amount,
							address,
						};
					}) ?? null,
			};
		},
		...mutationOptions,
	});
}
