use dep::protocol_types::{abis::function_selector::FunctionSelector, address::{AztecAddress, EthAddress}, header::Header};

use crate::context::gas::GasOpts;
use crate::context::public_context::FunctionReturns;

trait ContextInterface {
    fn push_new_note_hash(&mut self, note_hash: Field);
    fn push_new_nullifier(&mut self, nullifier: Field, nullified_commitment: Field);
    fn msg_sender(self) -> AztecAddress;
    fn this_address(self) -> AztecAddress;
    fn this_portal_address(self) -> EthAddress;
    fn chain_id(self) -> Field;
    fn version(self) -> Field;
    fn selector(self) -> FunctionSelector;
    fn get_args_hash(self) -> Field;
    fn get_header(self) -> Header;
}

// TEMPORARY: This trait is to promote sharing of the current public context
// and the upcoming AvmContext. This will be removed once the AvmContext is the default.
// If you are adding something here, then you should also implement it in the AvmContext.
trait PublicContextInterface {
    fn block_number(self) -> Field;
    fn timestamp(self) -> u64;
    fn coinbase(self) -> EthAddress;
    fn fee_recipient(self) -> AztecAddress;
    fn fee_per_da_gas(self) -> Field;
    fn fee_per_l1_gas(self) -> Field;
    fn fee_per_l2_gas(self) -> Field;
    fn push_nullifier_read_request(&mut self, nullifier: Field);
    fn push_nullifier_non_existent_read_request(&mut self, nullifier: Field);
    fn message_portal(&mut self, recipient: EthAddress, content: Field);
    fn consume_l1_to_l2_message(&mut self, content: Field, secret: Field, sender: EthAddress);
    fn accumulate_encrypted_logs<N>(&mut self, log: [Field; N]);
    fn accumulate_unencrypted_logs<T>(&mut self, log: T);
    fn call_public_function<ARGS_COUNT, RETURNS_COUNT>(
        self: &mut Self,
        contract_address: AztecAddress,
        function_selector: FunctionSelector,
        args: [Field; ARGS_COUNT],
        gas_opts: GasOpts
    ) -> FunctionReturns<RETURNS_COUNT>;
    fn static_call_public_function<ARGS_COUNT, RETURNS_COUNT>(
        self: &mut Self,
        contract_address: AztecAddress,
        function_selector: FunctionSelector,
        args: [Field; ARGS_COUNT],
        gas_opts: GasOpts
    ) -> FunctionReturns<RETURNS_COUNT>;
    fn delegate_call_public_function<ARGS_COUNT, RETURNS_COUNT>(
        self: &mut Self,
        contract_address: AztecAddress,
        function_selector: FunctionSelector,
        args: [Field; ARGS_COUNT]
    ) -> FunctionReturns<RETURNS_COUNT>;
    fn nullifier_exists(self, unsiloed_nullifier: Field, address: AztecAddress) -> bool;
}
