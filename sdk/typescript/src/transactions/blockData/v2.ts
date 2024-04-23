// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { EnumInputShape, EnumOutputShape } from '@mysten/bcs';
import type { BaseSchema, Input, Output } from 'valibot';
import {
	array,
	boolean,
	custom,
	integer,
	literal,
	nullable,
	nullish,
	number,
	object,
	optional,
	record,
	recursive,
	string,
	transform,
	tuple,
	union,
	unknown,
} from 'valibot';

import { isValidSuiAddress, normalizeSuiAddress } from '../../utils/sui-types.js';

type Merge<T> = T extends object ? { [K in keyof T]: T[K] } : never;

type EnumSchema<T extends Record<string, BaseSchema<any>>> = BaseSchema<
	EnumInputShape<
		Merge<{
			[K in keyof T]: Input<T[K]>;
		}>
	>,
	EnumOutputShape<
		Merge<{
			[K in keyof T]: Output<T[K]>;
		}>
	>
>;

export function safeEnum<T extends Record<string, BaseSchema<any>>>(options: T): EnumSchema<T> {
	const unionOptions = Object.entries(options).map(([key, value]) => object({ [key]: value }));

	return transform(union(unionOptions), (value) => ({
		...value,
		$kind: Object.keys(value)[0] as keyof typeof value,
	})) as EnumSchema<T>;
}

const SuiAddress = transform(string(), (value) => normalizeSuiAddress(value), [
	custom(isValidSuiAddress),
]);
const ObjectID = SuiAddress;
const BCSBytes = string();
const JsonU64 = union(
	[string(), number([integer()])],
	[
		custom((val) => {
			try {
				BigInt(val);
				return BigInt(val) >= 0 && BigInt(val) <= 18446744073709551615n;
			} catch {
				return false;
			}
		}, 'Invalid u64'),
	],
);
// https://github.com/MystenLabs/sui/blob/df41d5fa8127634ff4285671a01ead00e519f806/crates/sui-types/src/base_types.rs#L138
// Implemented as a tuple in rust
export const ObjectRef = object({
	objectId: SuiAddress,
	version: JsonU64,
	digest: string(),
});
export type ObjectRef = Output<typeof ObjectRef>;

// https://github.com/MystenLabs/sui/blob/df41d5fa8127634ff4285671a01ead00e519f806/crates/sui-types/src/transaction.rs#L690-L702
export const Argument = transform(
	union([
		object({ GasCoin: literal(true) }),
		object({ Input: number([integer()]), type: optional(literal('pure')) }),
		object({ Input: number([integer()]), type: optional(literal('object')) }),
		object({ Result: number([integer()]) }),
		object({ NestedResult: tuple([number([integer()]), number([integer()])]) }),
	]),
	(value) => ({
		...value,
		$kind: Object.keys(value)[0] as keyof typeof value,
	}),
	// Defined manually to add `type?: 'pure' | 'object'` to Input
) as BaseSchema<
	// Input
	| { GasCoin: true }
	| { Input: number; type?: 'pure' | 'object' }
	| { Result: number }
	| { NestedResult: [number, number] },
	// Output
	| { $kind: 'GasCoin'; GasCoin: true }
	| { $kind: 'Input'; Input: number; type?: 'pure' }
	| { $kind: 'Input'; Input: number; type?: 'object' }
	| { $kind: 'Result'; Result: number }
	| { $kind: 'NestedResult'; NestedResult: [number, number] }
>;

export type Argument = Output<typeof Argument>;

// https://github.com/MystenLabs/sui/blob/df41d5fa8127634ff4285671a01ead00e519f806/crates/sui-types/src/transaction.rs#L1387-L1392
export const GasData = object({
	budget: nullable(JsonU64),
	price: nullable(JsonU64),
	owner: nullable(SuiAddress),
	payment: nullable(array(ObjectRef)),
});
export type GasData = Output<typeof GasData>;

// https://github.com/MystenLabs/sui/blob/df41d5fa8127634ff4285671a01ead00e519f806/external-crates/move/crates/move-core-types/src/language_storage.rs#L140-L147
export const StructTag = object({
	address: string(),
	module: string(),
	name: string(),
	// type_params in rust, should be updated to use camelCase
	typeParams: array(string()),
});
export type StructTag = Output<typeof StructTag>;

// https://github.com/MystenLabs/sui/blob/cea8742e810142a8145fd83c4c142d61e561004a/crates/sui-graphql-rpc/schema/current_progress_schema.graphql#L1614-L1627
export type OpenMoveTypeSignatureBody =
	| 'address'
	| 'bool'
	| 'u8'
	| 'u16'
	| 'u32'
	| 'u64'
	| 'u128'
	| 'u256'
	| { vector: OpenMoveTypeSignatureBody }
	| {
			datatype: {
				package: string;
				module: string;
				type: string;
				typeParameters: OpenMoveTypeSignatureBody[];
			};
	  }
	| { typeParameter: number };

const OpenMoveTypeSignatureBody: BaseSchema<OpenMoveTypeSignatureBody> = union([
	literal('address'),
	literal('bool'),
	literal('u8'),
	literal('u16'),
	literal('u32'),
	literal('u64'),
	literal('u128'),
	literal('u256'),
	object({ vector: recursive(() => OpenMoveTypeSignatureBody) }),
	object({
		datatype: object({
			package: string(),
			module: string(),
			type: string(),
			typeParameters: array(recursive(() => OpenMoveTypeSignatureBody)),
		}),
	}),
	object({ typeParameter: number([integer()]) }),
]);

// https://github.com/MystenLabs/sui/blob/cea8742e810142a8145fd83c4c142d61e561004a/crates/sui-graphql-rpc/schema/current_progress_schema.graphql#L1609-L1612
const OpenMoveTypeSignature = object({
	ref: nullable(union([literal('&'), literal('&mut')])),
	body: OpenMoveTypeSignatureBody,
});
export type OpenMoveTypeSignature = Output<typeof OpenMoveTypeSignature>;

// https://github.com/MystenLabs/sui/blob/df41d5fa8127634ff4285671a01ead00e519f806/crates/sui-types/src/transaction.rs#L707-L718
const ProgrammableMoveCall = object({
	package: ObjectID,
	module: string(),
	function: string(),
	// snake case in rust
	typeArguments: array(string()),
	arguments: array(Argument),
	argumentTypes: optional(nullable(array(OpenMoveTypeSignature))),
});
export type ProgrammableMoveCall = Output<typeof ProgrammableMoveCall>;

export const Intent = object({
	name: string(),
	inputs: record(string(), union([Argument, array(Argument)])),
	data: record(string(), unknown()),
});

// https://github.com/MystenLabs/sui/blob/df41d5fa8127634ff4285671a01ead00e519f806/crates/sui-types/src/transaction.rs#L657-L685
export const Transaction = safeEnum({
	MoveCall: ProgrammableMoveCall,
	TransferObjects: object({
		objects: array(Argument),
		recipient: Argument,
	}),
	SplitCoins: object({
		coin: Argument,
		amounts: array(Argument),
	}),
	MergeCoins: object({
		destination: Argument,
		sources: array(Argument),
	}),
	Publish: object({
		modules: array(BCSBytes),
		dependencies: array(ObjectID),
	}),
	MakeMoveVec: object({
		type: nullable(string()),
		objects: array(Argument),
	}),
	Upgrade: object({
		modules: array(BCSBytes),
		dependencies: array(ObjectID),
		package: ObjectID,
		ticket: Argument,
	}),
	Intent,
});

export type Transaction<Arg = Argument> = EnumOutputShape<{
	MoveCall: {
		package: string;
		module: string;
		function: string;
		typeArguments: string[];
		arguments: Arg[];
		argumentTypes?: OpenMoveTypeSignature[] | null;
	};
	TransferObjects: {
		objects: Arg[];
		recipient: Arg;
	};
	SplitCoins: {
		coin: Arg;
		amounts: Arg[];
	};
	MergeCoins: {
		destination: Arg;
		sources: Arg[];
	};
	Publish: {
		modules: string[];
		dependencies: string[];
	};
	MakeMoveVec: {
		type: string | null;
		objects: Arg[];
	};
	Upgrade: {
		modules: string[];
		dependencies: string[];
		package: string;
		ticket: Arg;
	};
	Intent: {
		name: string;
		inputs: Record<string, Argument | Argument[]>;
		data: Record<string, unknown>;
	};
}>;

// https://github.com/MystenLabs/sui/blob/df41d5fa8127634ff4285671a01ead00e519f806/crates/sui-types/src/transaction.rs#L102-L114
export const ObjectArg = safeEnum({
	ImmOrOwnedObject: ObjectRef,
	SharedObject: object({
		objectId: ObjectID,
		// snake case in rust
		initialSharedVersion: JsonU64,
		mutable: nullable(boolean()),
	}),
	Receiving: ObjectRef,
});

// https://github.com/MystenLabs/sui/blob/df41d5fa8127634ff4285671a01ead00e519f806/crates/sui-types/src/transaction.rs#L75-L80
const CallArg = safeEnum({
	Object: ObjectArg,
	Pure: object({
		bytes: BCSBytes,
	}),
	UnresolvedPure: object({
		value: unknown(),
	}),
	UnresolvedObject: object({
		objectId: ObjectID,
		version: optional(nullable(JsonU64)),
		digest: optional(nullable(string())),
		initialSharedVersion: optional(nullable(JsonU64)),
		mutable: optional(nullable(boolean())),
		receiving: optional(nullable(boolean())),
	}),
});
export type CallArg = Output<typeof CallArg>;

export const NormalizedCallArg = safeEnum({
	Object: ObjectArg,
	Pure: object({
		bytes: BCSBytes,
	}),
});

export const TransactionExpiration = safeEnum({
	None: literal(true),
	Epoch: JsonU64,
});

export type TransactionExpiration = Output<typeof TransactionExpiration>;

export const TransactionBlockState = object({
	version: literal(2),

	sender: nullish(SuiAddress),
	expiration: nullish(TransactionExpiration),
	gasData: GasData,
	inputs: array(CallArg),
	transactions: array(Transaction),
});
export type TransactionBlockState = Output<typeof TransactionBlockState>;

export const example1: Input<typeof TransactionBlockState> = {
	version: 2,
	sender: '0x123', // or null
	expiration: { Epoch: '123' }, // or { None: true } or null
	// All properties of gasData are optional
	gasData: {
		budget: '123', // or null
		owner: '0x123', // or null
		price: '123', // or null
		payment: [
			{
				objectId: '0x123',
				version: '123', // or null
				digest: 'abc', // or null
			},
		], // or null
	},
	inputs: [
		{
			Object: {
				ImmOrOwnedObject: {
					objectId: '0x123',
					version: 123,
					digest: 'abc',
				},
			},
		},
		{
			Object: {
				SharedObject: {
					objectId: '0x123',
					initialSharedVersion: '123',
					mutable: true,
				},
			},
		},
		{
			Object: {
				Receiving: {
					objectId: '0x123',
					version: 123,
					digest: 'abc',
				},
			},
		},
		{
			Pure: {
				// base64 encoded bcs bytes
				bytes: 'cHVyZSB2YWx1ZSBieXRlcw==',
			},
		},
		{
			// Don't know schema to encode pure value to bcs
			UnresolvedPure: {
				value: 123,
			},
		},
		{
			// Only know ID
			UnresolvedObject: {
				objectId: '0x123',
			},
		},
		{
			// know its receiving, but don't know its version/digest
			UnresolvedObject: {
				objectId: '0x123',
				receiving: true,
			},
		},
		{
			// Know its shared, but not if its mutable
			UnresolvedObject: {
				objectId: '0x123',
				initialSharedVersion: '123',
			},
		},
		{
			// Don't know if its receiving
			UnresolvedObject: {
				objectId: '0x123',
				digest: 'abc',
				version: 123,
			},
		},
	],
	transactions: [
		{
			MoveCall: {
				package: '0x123',
				module: 'module',
				function: 'function',
				typeArguments: ['0x2::coin::Coin<0x2:sui::SUI>'],
				arguments: [
					{
						GasCoin: true,
					},
					{
						Result: 1,
					},
					{
						NestedResult: [1, 2],
					},
					{
						Input: 0,
					},
				],
				// Returned by resolve
				argumentTypes: [
					{
						ref: '&',
						body: {
							datatype: {
								package: '0x2',
								module: 'coin',
								type: 'coin',
								typeParameters: [
									{
										datatype: {
											package: '0x2',
											module: 'sui',
											type: 'SUI',
											typeParameters: [],
										},
									},
								],
							},
						},
					},
					{
						ref: '&mut',
						body: {
							datatype: {
								package: '0x2',
								module: 'something',
								type: 'mutable',
								typeParameters: [],
							},
						},
					},
					{
						ref: null,
						body: 'u8',
					},
				],
			},
		},
		{
			TransferObjects: {
				objects: [
					{
						GasCoin: true,
					},
				],
				recipient: {
					Input: 0,
				},
			},
		},
		{
			SplitCoins: {
				coin: {
					GasCoin: true,
				},
				amounts: [
					{
						Input: 0,
					},
				],
			},
		},
		{
			MergeCoins: {
				destination: {
					Input: 0,
				},
				sources: [
					{
						Input: 1,
					},
				],
			},
		},
		{
			Publish: {
				modules: ['bW9kdWxlIGJ5dGVz'],
				dependencies: ['0x123'],
			},
		},
		{
			MakeMoveVec: {
				type: 'Ox2::coin::Coin<0x2:sui::SUI>',
				objects: [
					{
						Input: 0,
					},
				],
			},
		},
		{
			Upgrade: {
				modules: ['bW9kdWxlIGJ5dGVz'],
				dependencies: ['0x123'],
				package: '0x123',
				ticket: {
					Input: 0,
				},
			},
		},
		{
			Intent: {
				name: 'CoinWithBalance',
				inputs: {
					someInput: { Input: 0 },
					SomeOtherArg: { Result: 1 },
					ListOfArgs: [{ Input: 2 }, { Input: 3 }],
				},
				data: {
					amount: 123,
				},
			},
		},
	],
};
