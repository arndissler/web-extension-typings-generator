import * as fs from "fs";
import * as path from "path";
import ts from "typescript";

import { createSingleTyping } from "./typeFactory";
import { WebExtensionSchemaMapping } from "./typeFactory/types";
import {
  isReferenceType,
  isWithDescription,
  isWithId,
} from "./typeFactory/guards";
import { createDescription } from "./utils";

const createTypingsForNamespace = (
  namespace: string,
  mergedSchema: WebExtensionSchemaMapping,
  factory: ts.NodeFactory
): readonly ts.Node[] => {
  const types = (mergedSchema[namespace].types || []).concat(
    mergedSchema[namespace].functions || []
  );

  const typeDeclarations: ts.Node[] = [];
  for (const type of types) {
    if (isReferenceType(type)) {
      // merge the referenced type into the current type
      console.warn(`Reference types are not supported yet: ${type.$ref}`);
    }

    if (isWithId(type) && type.id) {
      if (isWithDescription(type)) {
        const comment = createDescription(type, factory);
        typeDeclarations.push(comment);
      }

      const declaration = createSingleTyping(type, factory, false);

      if (
        declaration &&
        (ts.isTypeNode(declaration) ||
          ts.isTypeAliasDeclaration(declaration) ||
          // ts.isTypeLiteralNode(declaration) ||
          ts.isLiteralTypeNode(declaration) ||
          ts.isInterfaceDeclaration(declaration) ||
          ts.isPropertySignature(declaration) ||
          ts.isMethodSignature(declaration))
      ) {
        // if (declaration && typeof declaration !== "number") {
        typeDeclarations.push(declaration);
      } else {
        // if (declaration === undefined) {
        console.warn(
          `Maybe error to create typing in ${namespace} for ${
            isWithId(type) ? type.id : "unknown"
          }`
        );
        // } else
      }
    }
  }

  return typeDeclarations;
};

const outfile = path.join(__dirname, "..", ".out/messenger.d.ts");

const schemaDir = path.join(
  __dirname,
  "..",
  ".schemas/webext-schemas/schema-files"
);
const schemaFiles = fs.readdirSync(schemaDir);

const mergedSchema: WebExtensionSchemaMapping = {};

for (const file of schemaFiles) {
  const filePath = path.join(schemaDir, file);
  const schemaList = JSON.parse(fs.readFileSync(filePath, "utf8"));

  if (Array.isArray(schemaList)) {
    schemaList.forEach((schema) => {
      try {
        const {
          events = [],
          types = [],
          functions = [],
          namespace,
          permissions = [],
          properties = {},
          description = "",
        } = schema;
        if (namespace) {
          // console.log(`Merging schema for ${namespace}`);
          if (mergedSchema[namespace]) {
            mergedSchema[namespace].events =
              mergedSchema[namespace].events.concat(events);
            mergedSchema[namespace].types =
              mergedSchema[namespace].types.concat(types);
            mergedSchema[namespace].functions =
              mergedSchema[namespace].functions.concat(functions);
            mergedSchema[namespace].permissions =
              mergedSchema[namespace].permissions.concat(permissions);
            mergedSchema[namespace].properties =
              mergedSchema[namespace].permissions.concat(properties);
          } else {
            mergedSchema[namespace] = {
              description,
              events,
              types,
              functions,
              permissions,
              properties,
              sourceFile: file,
            };
          }
        } else {
          console.error(`Schema in ${file} does not have a namespace`);
        }
      } catch (ex: any) {
        console.error(`Error parsing schema in ${file}: ${ex.message}`);
      }
    });
  } else {
    console.error(`Schema in ${file} is not an array`);
  }
}

const factory = ts.factory;

const createNamespaceModules = (
  mergedSchema: { [key: string]: any },
  options: { ignoredNamespaces: string[] }
) => {
  const statements: ts.Statement[] = [];

  Object.entries(mergedSchema).forEach(([namespace, _value]) => {
    if (options.ignoredNamespaces.includes(namespace)) {
      return;
    }

    statements.push(
      factory.createModuleDeclaration(
        undefined,
        factory.createIdentifier(namespace),
        factory.createModuleBlock(
          createTypingsForNamespace(
            namespace,
            mergedSchema,
            factory
          ) as ts.Statement[]
        ),
        ts.NodeFlags.Namespace
      )
    );
  });

  const moduleBody = factory.createModuleBlock(statements);

  return moduleBody;
};

const nsMessenger = factory.createModuleDeclaration(
  [factory.createModifier(ts.SyntaxKind.DeclareKeyword)],
  factory.createIdentifier("messenger"),
  createNamespaceModules(mergedSchema, { ignoredNamespaces: [] }),
  ts.NodeFlags.Namespace
);

const source = ts.createSourceFile(
  "../.out/messenger.d.ts",
  "",
  ts.ScriptTarget.Latest,
  false,
  ts.ScriptKind.TS
);
const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });

const src = printer.printList(
  ts.ListFormat.MultiLineBlockStatements,
  factory.createNodeArray([
    /* /// <reference lib="dom" /> */
    bootstrapWindowVariables(),
    nsMessenger,
  ]),
  source
);

fs.writeFileSync(outfile, src, { flag: "w+" });
console.log(src);
console.log(mergedSchema);

function bootstrapWindowVariables(): ts.Statement {
  return factory.createInterfaceDeclaration(
    undefined,
    factory.createIdentifier("Window"),
    undefined,
    undefined,
    [
      factory.createPropertySignature(
        undefined,
        factory.createIdentifier("messenger"),
        undefined,
        factory.createTypeReferenceNode("typeof messenger")
      ),
    ]
  );
}
