import { CompleteAddress, type GrumpkinPrivateKey, type PXE } from '@aztec/circuit-types';
import { type PublicKey, getContractInstanceFromDeployParams } from '@aztec/circuits.js';
import { Fr } from '@aztec/foundation/fields';
import { type ContractInstanceWithAddress } from '@aztec/types/contracts';

import { type AccountContract } from '../account/contract.js';
import { type Salt } from '../account/index.js';
import { type AccountInterface } from '../account/interface.js';
import { type DeployOptions } from '../contract/deploy_method.js';
import { DefaultWaitOpts, type WaitOpts } from '../contract/sent_tx.js';
import { DefaultMultiCallEntrypoint } from '../entrypoint/default_multi_call_entrypoint.js';
import { waitForAccountSynch } from '../utils/account.js';
import { generatePublicKey } from '../utils/index.js';
import { AccountWalletWithPrivateKey, SignerlessWallet } from '../wallet/index.js';
import { DeployAccountMethod } from './deploy_account_method.js';
import { DeployAccountSentTx } from './deploy_account_sent_tx.js';

/**
 * Options to deploy an account contract.
 */
export type DeployAccountOptions = Pick<DeployOptions, 'fee' | 'skipClassRegistration' | 'skipPublicDeployment'>;

/**
 * Manages a user account. Provides methods for calculating the account's address, deploying the account contract,
 * and creating and registering the user wallet in the PXE Service.
 */
export class AccountManager {
  /** Deployment salt for the account contract. */
  public readonly salt: Fr;

  // TODO(@spalladino): Does it make sense to have both completeAddress and instance?
  private completeAddress?: CompleteAddress;
  private instance?: ContractInstanceWithAddress;
  private encryptionPublicKey?: PublicKey;
  private deployMethod?: DeployAccountMethod;

  constructor(
    private pxe: PXE,
    private encryptionPrivateKey: GrumpkinPrivateKey,
    private accountContract: AccountContract,
    salt?: Salt,
  ) {
    this.salt = salt !== undefined ? new Fr(salt) : Fr.random();
  }

  protected getEncryptionPublicKey() {
    if (!this.encryptionPublicKey) {
      this.encryptionPublicKey = generatePublicKey(this.encryptionPrivateKey);
    }
    return this.encryptionPublicKey;
  }

  /**
   * Returns the entrypoint for this account as defined by its account contract.
   * @returns An entrypoint.
   */
  public async getAccount(): Promise<AccountInterface> {
    const nodeInfo = await this.pxe.getNodeInfo();
    const completeAddress = this.getCompleteAddress();
    return this.accountContract.getInterface(completeAddress, nodeInfo);
  }

  /**
   * Gets the calculated complete address associated with this account.
   * Does not require the account to be deployed or registered.
   * @returns The address, partial address, and encryption public key.
   */
  public getCompleteAddress(): CompleteAddress {
    if (!this.completeAddress) {
      const encryptionPublicKey = generatePublicKey(this.encryptionPrivateKey);
      const instance = this.getInstance();
      this.completeAddress = CompleteAddress.fromPublicKeyAndInstance(encryptionPublicKey, instance);
    }
    return this.completeAddress;
  }

  /**
   * Returns the contract instance definition associated with this account.
   * Does not require the account to be deployed or registered.
   * @returns ContractInstance instance.
   */
  public getInstance(): ContractInstanceWithAddress {
    if (!this.instance) {
      const encryptionPublicKey = generatePublicKey(this.encryptionPrivateKey);
      this.instance = getContractInstanceFromDeployParams(this.accountContract.getContractArtifact(), {
        constructorArgs: this.accountContract.getDeploymentArgs(),
        salt: this.salt,
        publicKey: encryptionPublicKey,
      });
    }
    return this.instance;
  }

  /**
   * Returns a Wallet instance associated with this account. Use it to create Contract
   * instances to be interacted with from this account.
   * @returns A Wallet instance.
   */
  public async getWallet(): Promise<AccountWalletWithPrivateKey> {
    const entrypoint = await this.getAccount();
    return new AccountWalletWithPrivateKey(this.pxe, entrypoint, this.encryptionPrivateKey, this.salt);
  }

  /**
   * Registers this account in the PXE Service and returns the associated wallet. Registering
   * the account on the PXE Service is required for managing private state associated with it.
   * Use the returned wallet to create Contract instances to be interacted with from this account.
   * @param opts - Options to wait for the account to be synched.
   * @returns A Wallet instance.
   */
  public async register(opts: WaitOpts = DefaultWaitOpts): Promise<AccountWalletWithPrivateKey> {
    await this.#register();
    await this.pxe.registerContract({
      artifact: this.accountContract.getContractArtifact(),
      instance: this.getInstance(),
    });

    await waitForAccountSynch(this.pxe, this.getCompleteAddress(), opts);
    return this.getWallet();
  }

  /**
   * Returns the pre-populated deployment method to deploy the account contract that backs this account.
   * Typically you will not need this method and can call `deploy` directly. Use this for having finer
   * grained control on when to create, simulate, and send the deployment tx.
   * @returns A DeployMethod instance that deploys this account contract.
   */
  public async getDeployMethod() {
    if (!this.deployMethod) {
      if (!this.isDeployable()) {
        throw new Error(
          `Account contract ${this.accountContract.getContractArtifact().name} does not require deployment.`,
        );
      }
      await this.#register();
      const encryptionPublicKey = this.getEncryptionPublicKey();
      const { chainId, protocolVersion } = await this.pxe.getNodeInfo();
      const deployWallet = new SignerlessWallet(this.pxe, new DefaultMultiCallEntrypoint(chainId, protocolVersion));

      // We use a signerless wallet with the multi call entrypoint in order to make multiple calls in one go
      // If we used getWallet, the deployment would get routed via the account contract entrypoint
      // and it can't be used unless the contract is initialized
      const args = this.accountContract.getDeploymentArgs() ?? [];
      this.deployMethod = new DeployAccountMethod(
        this.accountContract.getAuthWitnessProvider(this.getCompleteAddress()),
        encryptionPublicKey,
        deployWallet,
        this.accountContract.getContractArtifact(),
        args,
        'constructor',
        'pay_init_fee',
      );
    }
    return this.deployMethod;
  }

  /**
   * Deploys the account contract that backs this account.
   * Does not register the associated class nor publicly deploy the instance by default.
   * Uses the salt provided in the constructor or a randomly generated one.
   * Registers the account in the PXE Service before deploying the contract.
   * @param opts - Fee options to be used for the deployment.
   * @returns A SentTx object that can be waited to get the associated Wallet.
   */
  public deploy(opts?: DeployAccountOptions): DeployAccountSentTx {
    const sentTx = this.getDeployMethod()
      .then(deployMethod =>
        deployMethod.send({
          contractAddressSalt: this.salt,
          skipClassRegistration: opts?.skipClassRegistration ?? true,
          skipPublicDeployment: opts?.skipPublicDeployment ?? true,
          skipInitialization: false,
          universalDeploy: true,
          fee: opts?.fee,
        }),
      )
      .then(tx => tx.getTxHash());
    return new DeployAccountSentTx(this.pxe, sentTx, this.getWallet());
  }

  /**
   * Deploys the account contract that backs this account if needed and awaits the tx to be mined.
   * Uses the salt provided in the constructor or a randomly generated one. If no initialization
   * is required it skips the transaction, and only registers the account in the PXE Service.
   * @param opts - Options to wait for the tx to be mined.
   * @returns A Wallet instance.
   */
  public async waitSetup(opts: WaitOpts = DefaultWaitOpts): Promise<AccountWalletWithPrivateKey> {
    await (this.isDeployable() ? this.deploy().wait(opts) : this.register());
    return this.getWallet();
  }

  /**
   * Returns whether this account contract has a constructor and needs deployment.
   */
  public isDeployable() {
    return this.accountContract.getDeploymentArgs() !== undefined;
  }

  async #register(): Promise<void> {
    const completeAddress = this.getCompleteAddress();
    await this.pxe.registerAccount(this.encryptionPrivateKey, completeAddress.partialAddress);
  }
}
