use crate::{
    abis::function_selector::FunctionSelector, address::{EthAddress, AztecAddress},
    constants::GAS_FEES_LENGTH, hash::pedersen_hash, traits::{Deserialize, Hash, Serialize, Empty},
    abis::side_effect::Ordered, utils::reader::Reader
};

struct GasFees {
    fee_per_da_gas: Field,
    fee_per_l1_gas: Field,
    fee_per_l2_gas: Field,
}

impl GasFees {
    fn new(fee_per_da_gas: Field, fee_per_l1_gas: Field, fee_per_l2_gas: Field) -> Self {
        Self { fee_per_da_gas, fee_per_l1_gas, fee_per_l2_gas }
    }
}

impl Serialize<GAS_FEES_LENGTH> for GasFees {
    fn serialize(self) -> [Field; GAS_FEES_LENGTH] {
        [self.fee_per_da_gas, self.fee_per_l1_gas, self.fee_per_l2_gas]
    }
}

impl Deserialize<GAS_FEES_LENGTH> for GasFees {
    fn deserialize(serialized: [Field; GAS_FEES_LENGTH]) -> GasFees {
        GasFees::new(serialized[0], serialized[1], serialized[2])
    }
}

impl Eq for GasFees {
    fn eq(self, other : GasFees) -> bool {
        (self.fee_per_da_gas == other.fee_per_da_gas) & (self.fee_per_l1_gas == other.fee_per_l1_gas) & (self.fee_per_l2_gas == other.fee_per_l2_gas)
    }
}

impl Empty for GasFees {
    fn empty() -> Self {
        GasFees::new(0, 0, 0)
    }
}
