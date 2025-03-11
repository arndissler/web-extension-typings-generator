#!/usr/bin/env node

/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { createTypingsFile } from "./index";

const parseCommandLineArgs = () => {
  const args = process.argv.slice(2);
  const options = {
    schemaDir: "",
    outfile: "",
    help: false,
    force: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case "--schemaDir":
        options.schemaDir = args[i + 1] || "";
        break;
      case "--outfile":
        options.outfile = args[i + 1] || "";
        break;
      case "--force":
        options.force = true;
        break;
      case "--help":
        options.help = true;
        break;
    }
  }

  if (!options.schemaDir || !options.outfile) {
    options.help = true;
  }

  return options;
};

const main = async () => {
  const args = parseCommandLineArgs();

  if (args.help) {
    console.log(
      `Generate typings file from web extension schema files.

Usage: generate-web-extension-typings --schemaDir <dir> --outfile <file>

  --schemaDir <dir>    The directory containing the schema files (*.json)
  --outfile <file>     The output file to write the typings to
  --force              Create the directories if they don't exist
  --help               Show this help message
`
    );

    return;
  }

  await createTypingsFile(args.schemaDir, args.outfile, args.force);
};

main();
