use neurowealth_vault::{BatchDepositItem, NeuroWealthVaultClient};
use soroban_sdk::{testutils::Address as _, token, Address, BytesN, Env, Vec};

#[test]
#[ignore = "requires a release WASM build; see the vault README"]
fn batch_deposit_wasm_budget() {
    const AMOUNT: i128 = 10_000_000;
    let path = std::env::var_os("VAULT_BUDGET_WASM").expect("set VAULT_BUDGET_WASM");
    let wasm = std::fs::read(path).expect("read release vault WASM");

    println!("| Entries | CPU instructions | Memory bytes |");
    println!("| ---: | ---: | ---: |");
    let sizes: [fn(u32) -> u32; 3] = [|_| 1, |max| max.div_ceil(2), |max| max];
    for size in sizes {
        let env = Env::default();
        let mut budget = env.cost_estimate().budget();
        budget.reset_unlimited();
        env.mock_all_auths();

        let deployer = Address::generate(&env);
        let owner = Address::generate(&env);
        let agent = Address::generate(&env);
        let salt = BytesN::from_array(&env, &[0; 32]);
        let vault = env
            .deployer()
            .with_address(deployer.clone(), salt.clone())
            .deployed_address();
        env.register_at(&vault, wasm.as_slice(), ());
        let client = NeuroWealthVaultClient::new(&env, &vault);
        let asset = env
            .register_stellar_asset_contract_v2(owner.clone())
            .address();
        client.initialize(&deployer, &owner, &agent, &asset, &salt);

        let max_entries = client.get_max_batch_size();
        assert!(max_entries > 0);
        let entries_count = size(max_entries);
        let expected_assets = AMOUNT * i128::from(entries_count);
        token::StellarAssetClient::new(&env, &asset).mint(&agent, &expected_assets);

        let mut entries = Vec::new(&env);
        for _ in 0..entries_count {
            entries.push_back(BatchDepositItem {
                user: Address::generate(&env),
                amount: AMOUNT,
            });
        }

        budget.reset_unlimited();
        client.batch_deposit(&agent, &entries);
        let cpu = budget.cpu_instruction_cost();
        let memory = budget.memory_bytes_cost();

        assert_eq!(client.get_total_assets(), expected_assets);
        assert_eq!(
            token::Client::new(&env, &asset).balance(&vault),
            expected_assets
        );
        println!("| {entries_count} | {cpu} | {memory} |");
    }
}
