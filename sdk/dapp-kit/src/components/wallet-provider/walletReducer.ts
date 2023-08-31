// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { WalletWithSuiFeatures, WalletAccount } from '@mysten/wallet-standard';
import { assertUnreachable } from 'dapp-kit/src/utils/assertUnreachable';

type WalletConnectedAction = {
	type: 'wallet-connected';
	payload: {
		wallet: WalletWithSuiFeatures;
		currentAccount: WalletAccount | null;
	};
};

type WalletDisconnectedAction = {
	type: 'wallet-disconnected';
	payload?: never;
};

type WalletPropertiesChangedAction = {
	type: 'wallet-properties-changed';
	payload: {
		updatedAccounts: readonly WalletAccount[];
		currentAccount: WalletAccount | null;
	};
};

type WalletsChangedAction = {
	type: 'wallets-changed';
	payload: {
		wallets: WalletWithSuiFeatures[];
		currentWallet: WalletWithSuiFeatures;
	};
};

export type WalletState = {
	wallets: WalletWithSuiFeatures[];
	currentWallet: WalletWithSuiFeatures | null;
	accounts: readonly WalletAccount[];
	currentAccount: WalletAccount | null;
};

export type WalletAction =
	| WalletConnectedAction
	| WalletDisconnectedAction
	| WalletPropertiesChangedAction
	| WalletsChangedAction;

export function walletReducer(
	walletState: WalletState,
	{ type, payload }: WalletAction,
): WalletState {
	switch (type) {
		case 'wallet-connected':
			return {
				...walletState,
				currentWallet: payload.wallet,
				accounts: payload.wallet.accounts,
				currentAccount: payload.currentAccount,
			};
		case 'wallet-disconnected': {
			return {
				...walletState,
				currentWallet: null,
				accounts: [],
				currentAccount: null,
			};
		}
		case 'wallet-properties-changed': {
			return {
				...walletState,
				accounts: payload.updatedAccounts,
				currentAccount: payload.currentAccount,
			};
		}
		case 'wallets-changed': {
			return {
				...walletState,
				wallets: payload.wallets,
				currentWallet: payload.currentWallet,
			};
		}
		default:
			assertUnreachable(type);
	}
}
