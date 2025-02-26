import { computeInnerAuthWitHash, computeOuterAuthWitHash } from '@aztec/aztec.js';
import { type AuthWitnessProvider } from '@aztec/aztec.js/account';
import { type EntrypointInterface, EntrypointPayload, type ExecutionRequestInit } from '@aztec/aztec.js/entrypoint';
import { PackedValues, TxExecutionRequest } from '@aztec/circuit-types';
import { type AztecAddress, Fr, FunctionData, TxContext } from '@aztec/circuits.js';
import { type FunctionAbi, encodeArguments } from '@aztec/foundation/abi';

import { DEFAULT_CHAIN_ID, DEFAULT_VERSION } from './constants.js';

/**
 * Implementation for an entrypoint interface that follows the default entrypoint signature
 * for an account, which accepts an AppPayload and a FeePayload as defined in noir-libs/aztec-noir/src/entrypoint module
 */
export class DefaultDappEntrypoint implements EntrypointInterface {
  constructor(
    private userAddress: AztecAddress,
    private userAuthWitnessProvider: AuthWitnessProvider,
    private dappEntrypointAddress: AztecAddress,
    private chainId: number = DEFAULT_CHAIN_ID,
    private version: number = DEFAULT_VERSION,
  ) {}

  async createTxExecutionRequest(exec: ExecutionRequestInit): Promise<TxExecutionRequest> {
    const { calls } = exec;
    if (calls.length !== 1) {
      throw new Error(`Expected exactly 1 function call, got ${calls.length}`);
    }

    const payload = EntrypointPayload.fromFunctionCalls(calls);

    const abi = this.getEntrypointAbi();
    const entrypointPackedArgs = PackedValues.fromValues(encodeArguments(abi, [payload, this.userAddress]));

    const functionData = FunctionData.fromAbi(abi);

    const innerHash = computeInnerAuthWitHash([Fr.ZERO, functionData.selector.toField(), entrypointPackedArgs.hash]);
    const outerHash = computeOuterAuthWitHash(
      this.dappEntrypointAddress,
      new Fr(this.chainId),
      new Fr(this.version),
      innerHash,
    );

    const authWitness = await this.userAuthWitnessProvider.createAuthWit(outerHash);

    const txRequest = TxExecutionRequest.from({
      argsHash: entrypointPackedArgs.hash,
      origin: this.dappEntrypointAddress,
      functionData,
      txContext: TxContext.empty(this.chainId, this.version),
      packedArguments: [...payload.packedArguments, entrypointPackedArgs],
      authWitnesses: [authWitness],
    });

    return txRequest;
  }

  private getEntrypointAbi() {
    return {
      name: 'entrypoint',
      isInitializer: false,
      functionType: 'secret',
      isInternal: false,
      parameters: [
        {
          name: 'payload',
          type: {
            kind: 'struct',
            path: 'dapp_payload::DAppPayload',
            fields: [
              {
                name: 'function_calls',
                type: {
                  kind: 'array',
                  length: 1,
                  type: {
                    kind: 'struct',
                    path: 'authwit::entrypoint::function_call::FunctionCall',
                    fields: [
                      { name: 'args_hash', type: { kind: 'field' } },
                      {
                        name: 'function_selector',
                        type: {
                          kind: 'struct',
                          path: 'authwit::aztec::protocol_types::abis::function_selector::FunctionSelector',
                          fields: [{ name: 'inner', type: { kind: 'integer', sign: 'unsigned', width: 32 } }],
                        },
                      },
                      {
                        name: 'target_address',
                        type: {
                          kind: 'struct',
                          path: 'authwit::aztec::protocol_types::address::aztec_address::AztecAddress',
                          fields: [{ name: 'inner', type: { kind: 'field' } }],
                        },
                      },
                      { name: 'is_public', type: { kind: 'boolean' } },
                    ],
                  },
                },
              },
              { name: 'nonce', type: { kind: 'field' } },
            ],
          },
          visibility: 'public',
        },
        {
          name: 'user_address',
          type: {
            kind: 'struct',
            path: 'authwit::aztec::protocol_types::address::aztec_address::AztecAddress',
            fields: [{ name: 'inner', type: { kind: 'field' } }],
          },
          visibility: 'public',
        },
      ],
      returnTypes: [],
    } as FunctionAbi;
  }
}
