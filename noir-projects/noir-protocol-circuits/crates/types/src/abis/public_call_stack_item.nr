use crate::abis::{function_data::FunctionData, public_circuit_public_inputs::PublicCircuitPublicInputs};
use crate::address::AztecAddress;
use crate::constants::GENERATOR_INDEX__CALL_STACK_ITEM;
use crate::traits::Hash;

struct PublicCallStackItem {
    contract_address: AztecAddress,
    public_inputs: PublicCircuitPublicInputs,
    function_data: FunctionData,
    // True if this call stack item represents a request to execute a function rather than a
    // fulfilled execution. Used when enqueuing calls from private to public functions.
    is_execution_request: bool,
}

impl Hash for PublicCallStackItem {
    fn hash(self) -> Field {
        let item = if self.is_execution_request {
            self.as_execution_request()
        } else {
            self
        };

        dep::std::hash::pedersen_hash_with_separator([
            item.contract_address.to_field(),
            item.function_data.hash(),
            item.public_inputs.hash(),
        ], GENERATOR_INDEX__CALL_STACK_ITEM)
    }
}

impl PublicCallStackItem {
    fn as_execution_request(self) -> Self {
        let public_inputs = self.public_inputs;
        let mut request_public_inputs = PublicCircuitPublicInputs::empty();
        request_public_inputs.call_context = public_inputs.call_context;
        request_public_inputs.args_hash = public_inputs.args_hash;

        let call_stack_item = PublicCallStackItem {
            contract_address: self.contract_address,
            function_data: self.function_data,
            is_execution_request: true,
            public_inputs: request_public_inputs
        };
        call_stack_item
    }
}

mod tests {
    use crate::{
        abis::{
        function_data::FunctionData, function_selector::FunctionSelector,
        public_circuit_public_inputs::PublicCircuitPublicInputs,
        public_call_stack_item::PublicCallStackItem, side_effect::SideEffect
    },
        address::AztecAddress, constants::GENERATOR_INDEX__CALL_STACK_ITEM, traits::Hash
    };

    #[test]
    fn compute_call_stack_item_request_hash() {
        let contract_address = AztecAddress::from_field(1);
        let function_data = FunctionData { selector: FunctionSelector::from_u32(2), is_private: false };

        let mut public_inputs = PublicCircuitPublicInputs::empty();
        public_inputs.new_note_hashes[0] = SideEffect{
            value: 1,
            counter: 0,
        };

        let call_stack_item = PublicCallStackItem { contract_address, public_inputs, is_execution_request: true, function_data };

        // Value from public_call_stack_item.test.ts "Computes a callstack item request hash" test
        let test_data_call_stack_item_request_hash = 0x151bc9ee42eb63112fb2a350dcaa33c4c4b81cc37ded8773e785f47029f35983;
        assert_eq(call_stack_item.hash(), test_data_call_stack_item_request_hash);
    }

    #[test]
    fn compute_call_stack_item_hash() {
        let contract_address = AztecAddress::from_field(1);
        let function_data = FunctionData { selector: FunctionSelector::from_u32(2), is_private: false };

        let mut public_inputs = PublicCircuitPublicInputs::empty();
        public_inputs.new_note_hashes[0] = SideEffect{
            value: 1,
            counter: 0,
        };

        let call_stack_item = PublicCallStackItem { contract_address, public_inputs, is_execution_request: false, function_data };

        // Value from public_call_stack_item.test.ts "Computes a callstack item hash" test
        let test_data_call_stack_item_hash = 0x1a7b9d0cd965f512a3b3ed70333198a2a69bd4f9e70be68379c54e68a7b07a4c;
        assert_eq(call_stack_item.hash(), test_data_call_stack_item_hash);
    }
}
