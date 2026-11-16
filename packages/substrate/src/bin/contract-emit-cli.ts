#!/usr/bin/env node
/**
 * repop-contract-emit CLI — paste-ready worker contract from a JSON spec:
 *   node src/bin/contract-emit-cli.ts lane.json > contract.md
 * (see src/contract-emit.ts for the ContractInput shape)
 */
import fs from "node:fs";
import { emitContract, type ContractInput } from "../contract-emit.ts";

const file = process.argv[2];
if (!file) {
  console.error("usage: contract-emit-cli <spec.json>");
  process.exit(2);
}
const spec = JSON.parse(fs.readFileSync(file, "utf8")) as ContractInput;
process.stdout.write(`${emitContract(spec)}\n`);
