import { FunctionSelector, type GlobalVariables, type Header } from '@aztec/circuits.js';
import { computeVarArgsHash } from '@aztec/circuits.js/hash';
import { type AztecAddress } from '@aztec/foundation/aztec-address';
import { type EthAddress } from '@aztec/foundation/eth-address';
import { type Fr } from '@aztec/foundation/fields';

export class AvmContextInputs {
  static readonly SIZE = 2;

  constructor(private selector: Fr, private argsHash: Fr) {}

  public toFields(): Fr[] {
    return [this.selector, this.argsHash];
  }
}

/**
 * Contains variables that remain constant during AVM execution
 * These variables are provided by the public kernel circuit
 */
// TODO(https://github.com/AztecProtocol/aztec-packages/issues/3992): gas not implemented
export class AvmExecutionEnvironment {
  constructor(
    public readonly address: AztecAddress,
    public readonly storageAddress: AztecAddress,
    public readonly origin: AztecAddress,
    public readonly sender: AztecAddress,
    public readonly portal: EthAddress,
    public readonly feePerL1Gas: Fr,
    public readonly feePerL2Gas: Fr,
    public readonly feePerDaGas: Fr,
    public readonly contractCallDepth: Fr,
    public readonly header: Header,
    public readonly globals: GlobalVariables,
    public readonly isStaticCall: boolean,
    public readonly isDelegateCall: boolean,
    public readonly calldata: Fr[],

    // Function selector is temporary since eventually public contract bytecode will be one blob
    // containing all functions, and function selector will become an application-level mechanism
    // (e.g. first few bytes of calldata + compiler-generated jump table)
    public readonly temporaryFunctionSelector: FunctionSelector,
  ) {
    // We encode some extra inputs (AvmContextInputs) in calldata.
    // This will have to go once we move away from one proof per call.
    const inputs = new AvmContextInputs(temporaryFunctionSelector.toField(), computeVarArgsHash(calldata));
    this.calldata = [...inputs.toFields(), ...calldata];
  }

  public deriveEnvironmentForNestedCall(
    targetAddress: AztecAddress,
    calldata: Fr[],
    temporaryFunctionSelector: FunctionSelector = FunctionSelector.empty(),
  ): AvmExecutionEnvironment {
    return new AvmExecutionEnvironment(
      targetAddress,
      /*storageAddress=*/ targetAddress,
      this.origin,
      this.address,
      this.portal,
      this.feePerL1Gas,
      this.feePerL2Gas,
      this.feePerDaGas,
      this.contractCallDepth,
      this.header,
      this.globals,
      this.isStaticCall,
      this.isDelegateCall,
      calldata,
      temporaryFunctionSelector,
    );
  }

  public deriveEnvironmentForNestedStaticCall(
    address: AztecAddress,
    calldata: Fr[],
    temporaryFunctionSelector: FunctionSelector = FunctionSelector.empty(),
  ): AvmExecutionEnvironment {
    return new AvmExecutionEnvironment(
      address,
      /*storageAddress=*/ address,
      this.origin,
      this.sender,
      this.portal,
      this.feePerL1Gas,
      this.feePerL2Gas,
      this.feePerDaGas,
      this.contractCallDepth,
      this.header,
      this.globals,
      /*isStaticCall=*/ true,
      this.isDelegateCall,
      calldata,
      temporaryFunctionSelector,
    );
  }

  public newDelegateCall(
    address: AztecAddress,
    calldata: Fr[],
    temporaryFunctionSelector: FunctionSelector = FunctionSelector.empty(),
  ): AvmExecutionEnvironment {
    return new AvmExecutionEnvironment(
      address,
      this.storageAddress,
      this.origin,
      this.sender,
      this.portal,
      this.feePerL1Gas,
      this.feePerL2Gas,
      this.feePerDaGas,
      this.contractCallDepth,
      this.header,
      this.globals,
      this.isStaticCall,
      /*isDelegateCall=*/ true,
      calldata,
      temporaryFunctionSelector,
    );
  }
}
