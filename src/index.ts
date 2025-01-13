import * as fs from "fs";
import * as path from "path";
import ts from "typescript";

import { createSingleTyping } from "./typeFactory";
import { WebExtensionSchemaMapping } from "./typeFactory/types";
import {
  isFunctionType,
  isOptional,
  isReferenceType,
  isUnsupported,
  isWithFunctionParameters,
  isWithId,
  isWithName,
} from "./typeFactory/guards";
import { reservedWords } from "./reservedWords";
import { addJsDocAnnotation } from "./utils";

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

    if (isFunctionType(type) && isWithName(type)) {
      const functionDeclaration = createSingleTyping(type, {
        currentNamespace: namespace,
        knownTypes: types,
        schemaCatalog: mergedSchema,
        factory,
        context: "namespace",
      });

      if (
        functionDeclaration &&
        ts.isFunctionDeclaration(functionDeclaration)
      ) {
        const functionName = functionDeclaration.name?.text;
        if (functionName && reservedWords.includes(functionName)) {
          const functionAliasName = `__${functionName}`;
          let originalFunction = factory.updateFunctionDeclaration(
            functionDeclaration,
            [],
            functionDeclaration.asteriskToken,
            factory.createIdentifier(functionAliasName),
            functionDeclaration.typeParameters,
            functionDeclaration.parameters,
            functionDeclaration.type,
            undefined
          );

          let exportedFunctionDeclaration = factory.createExportDeclaration(
            undefined,
            false,
            factory.createNamedExports([
              factory.createExportSpecifier(
                false,
                factory.createIdentifier(functionAliasName),
                factory.createIdentifier(functionName)
              ),
            ]),
            undefined,
            undefined
          );

          typeDeclarations.push(originalFunction);
          typeDeclarations.push(exportedFunctionDeclaration);
        } else {
          typeDeclarations.push(functionDeclaration);
        }
      }
    } else if (isWithId(type) && type.id) {
      // refers to a type that has an id
      const declaration = createSingleTyping(type, {
        currentNamespace: namespace,
        knownTypes: types,
        schemaCatalog: mergedSchema,
        factory,
        context: "interface",
      });

      if (
        declaration &&
        (ts.isTypeNode(declaration) ||
          ts.isTypeAliasDeclaration(declaration) ||
          ts.isLiteralTypeNode(declaration) ||
          ts.isInterfaceDeclaration(declaration) ||
          ts.isPropertySignature(declaration) ||
          ts.isMethodSignature(declaration))
      ) {
        typeDeclarations.push(declaration);
      } else {
        console.warn(
          `Warning: maybe error to create typing in ${namespace} for type ${
            isWithId(type) ? type.id : "unknown"
          }`
        );
      }
    }
  }

  for (const event of mergedSchema[namespace].events || []) {
    if (isUnsupported(event)) {
      console.warn(
        `Warning: skipping unsupported event ${[
          namespace,
          isWithName(event) ? event.name : undefined,
        ]
          .filter(Boolean)
          .join(".")}`
      );

      continue;
    }

    let eventCallbackType = createSingleTyping(event, {
      currentNamespace: namespace,
      knownTypes: types,
      schemaCatalog: mergedSchema,
      factory,
      context: "inline",
    });

    if (eventCallbackType && ts.isFunctionTypeNode(eventCallbackType)) {
      const paramTypes = eventCallbackType.parameters;
      const params =
        isFunctionType(event) && isWithFunctionParameters(event)
          ? event.parameters
          : [];
      const allParamsMandatory = params.every((param) => !isOptional(param));

      if (!allParamsMandatory) {
        const firstOptionalIndex = params.findIndex((param) =>
          isOptional(param)
        );
        const firstMandatoryParams = params.findIndex(
          (param) => !isOptional(param)
        );

        if (
          firstOptionalIndex > -1 &&
          firstMandatoryParams > -1 &&
          firstOptionalIndex < firstMandatoryParams
        ) {
          // function declaration has optional parameters before mandatory ones
          // this is not supported in TypeScript, so we need to build a new function type
          // and create a union type with the new function type

          const possibleCallbackTypes = [];
          for (let i = firstOptionalIndex; i <= firstMandatoryParams; i++) {
            const modifiedParams = [
              ...params
                .slice(i, firstMandatoryParams)
                .map((item) => ({ ...item, optional: false })),
              ...params.slice(firstMandatoryParams),
            ];
            const modifiedEvent = {
              ...event,
              parameters: modifiedParams,
            };

            const modifiedEventCallbackType = createSingleTyping(
              modifiedEvent,
              {
                currentNamespace: namespace,
                knownTypes: types,
                schemaCatalog: mergedSchema,
                factory,
                context: "inline",
              }
            );

            if (
              modifiedEventCallbackType &&
              ts.isFunctionTypeNode(modifiedEventCallbackType)
            ) {
              possibleCallbackTypes.push(modifiedEventCallbackType);
            }
          }

          // create a union type with all possible function types
          eventCallbackType = factory.createUnionTypeNode(
            possibleCallbackTypes
          );
        }
      }

      const _eventDeclaration = factory.createVariableStatement(
        [factory.createToken(ts.SyntaxKind.ExportKeyword)],
        factory.createVariableDeclarationList(
          [
            factory.createVariableDeclaration(
              factory.createIdentifier(event.name),
              undefined,
              factory.createTypeReferenceNode(
                factory.createIdentifier("WebExtEvent"),
                [eventCallbackType]
              ),
              undefined
            ),
          ],
          ts.NodeFlags.Const
        )
      );

      typeDeclarations.push(addJsDocAnnotation(event, _eventDeclaration));
    } else {
      const name = [namespace, event.name].join(".");
      console.warn(`Error creating event typing for event ${name}`);
    }
  }

  return typeDeclarations;
};

const createNamespaceModules = (
  mergedSchema: { [key: string]: any },
  options: { ignoredNamespaces: string[] },
  factory: ts.NodeFactory
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

function bootstrapWindowVariables(factory: ts.NodeFactory): ts.Statement {
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

function bootstrapGlobalInterfaces(factory: ts.NodeFactory): ts.Statement[] {
  return [
    factory.createInterfaceDeclaration(
      undefined,
      factory.createIdentifier("WebExtEvent"),
      [
        factory.createTypeParameterDeclaration(
          undefined,
          factory.createIdentifier("TCallback"),
          factory.createFunctionTypeNode(
            undefined,
            [
              factory.createParameterDeclaration(
                undefined,
                factory.createToken(ts.SyntaxKind.DotDotDotToken),
                factory.createIdentifier("args"),
                undefined,
                factory.createArrayTypeNode(
                  factory.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword)
                ),
                undefined
              ),
            ],
            factory.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword)
          ),
          undefined
        ),
      ],
      undefined,
      [
        factory.createMethodSignature(
          undefined,
          factory.createIdentifier("addListener"),
          undefined,
          undefined,
          [
            factory.createParameterDeclaration(
              undefined,
              undefined,
              factory.createIdentifier("cb"),
              undefined,
              factory.createTypeReferenceNode(
                factory.createIdentifier("TCallback"),
                undefined
              ),
              undefined
            ),
          ],
          factory.createKeywordTypeNode(ts.SyntaxKind.VoidKeyword)
        ),
        factory.createMethodSignature(
          undefined,
          factory.createIdentifier("removeListener"),
          undefined,
          undefined,
          [
            factory.createParameterDeclaration(
              undefined,
              undefined,
              factory.createIdentifier("cb"),
              undefined,
              factory.createTypeReferenceNode(
                factory.createIdentifier("TCallback"),
                undefined
              ),
              undefined
            ),
          ],
          factory.createKeywordTypeNode(ts.SyntaxKind.VoidKeyword)
        ),
        factory.createMethodSignature(
          undefined,
          factory.createIdentifier("hasListener"),
          undefined,
          undefined,
          [
            factory.createParameterDeclaration(
              undefined,
              undefined,
              factory.createIdentifier("cb"),
              undefined,
              factory.createTypeReferenceNode(
                factory.createIdentifier("TCallback"),
                undefined
              ),
              undefined
            ),
          ],
          factory.createKeywordTypeNode(ts.SyntaxKind.BooleanKeyword)
        ),
      ]
    ),
  ];
}

const generateTypingsFromSchema = (schemaDir: string, outfile: string) => {
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
  const nsMessenger = factory.createModuleDeclaration(
    [factory.createModifier(ts.SyntaxKind.DeclareKeyword)],
    factory.createIdentifier("messenger"),
    createNamespaceModules(mergedSchema, { ignoredNamespaces: [] }, factory),
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
      bootstrapWindowVariables(factory),
      ...bootstrapGlobalInterfaces(factory),
      nsMessenger,
    ]),
    source
  );

  fs.writeFileSync(outfile, src, { flag: "w+" });
};

const outfile = path.join(__dirname, "..", ".out/messenger.d.ts");
const schemaDir = path.join(
  __dirname,
  "..",
  ".schemas/webext-schemas/schema-files"
);

generateTypingsFromSchema(schemaDir, outfile);
