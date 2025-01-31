import * as fs from "node:fs/promises";
import * as path from "node:path";
import ts from "typescript";

import { createSingleTyping } from "./typeFactory";
import { SingleType, WebExtensionSchemaMapping } from "./typeFactory/types";
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
import { addJsDocAnnotation, hasNonTrailingOptionalParameters } from "./utils";

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
      // check if we have any optional parameters that are not trailing
      const infixOptionalParameterPositions =
        hasNonTrailingOptionalParameters(type);
      const maxOptionalParameterCount = infixOptionalParameterPositions.length;

      const maybeOverloadedParameters = [];

      if (isWithFunctionParameters(type)) {
        // use the original parameter list as the first option
        maybeOverloadedParameters.push(type.parameters);

        if (maxOptionalParameterCount > 0) {
          // if we have optional parameters, we need to create all possible permutations:
          //  1) when we have n optional parameters, we have 2^n permutations
          //  2) we need to create a counter from 0 to 2^n - 1, for each number we
          //     create a binary representation, e.g. [ 0, 1, 1, 0] for four optional parameters
          //     0 represents a parameter that should be omitted, 1 for an included parameter
          //  3) we iterate over the binary representation and take over all parameters that
          //     should be omitted
          //  4) we finally iterate over all parameters from the original parameter list and skip
          //     all parameters that should be omitted
          //  5) with the new parameter list we create a new function declaration
          //     and add it to the implementation list
          for (
            let i = 0;
            i < Number(Math.pow(2, maxOptionalParameterCount) - 1);
            i++
          ) {
            const binaryCounter = (
              Array(maxOptionalParameterCount).join("0") + i.toString(2)
            )
              .slice(-maxOptionalParameterCount)
              .split("")
              .map(Number);
            // create a binary representation (e.g. [0, 1, 1, 0]) and map it to the parameter positions
            let removeParamPositions = binaryCounter.reduce<number[]>(
              (acc, position, index) => {
                if (position === 0) {
                  acc.push(infixOptionalParameterPositions[index]);
                }
                return acc;
              },
              []
            );

            const preparedParameterList = type.parameters.reduce<SingleType[]>(
              (acc, item, index) => {
                if (!removeParamPositions.includes(index)) {
                  acc.push(item);
                }
                return acc;
              },
              []
            );

            maybeOverloadedParameters.push(preparedParameterList);
          }
        }
      }

      // now iterate over all possible parameter lists and create a function declaration for each
      for (const parameters of maybeOverloadedParameters) {
        const preparedType = {
          ...type,
          parameters: parameters.map((item) => ({ ...item, optional: false })),
        };
        const functionDeclaration = createSingleTyping(preparedType, {
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

const generateTypingsFromSchema = async (
  schemaDir: string,
  outfile: string
) => {
  const schemaFiles = await fs.readdir(schemaDir, {});
  const mergedSchema: WebExtensionSchemaMapping = {};

  for (const file of schemaFiles) {
    const filePath = path.join(schemaDir, file);
    const [canRead, _] = await isFile(filePath);

    if (!canRead) {
      console.error(`Cannot read file ${filePath}`);
      continue;
    }

    if (!file.endsWith(".json")) {
      console.error(`Skipping non-json file ${file}`);
      continue;
    }

    const schemaList = JSON.parse(await fs.readFile(filePath, "utf8"));

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

  await fs.writeFile(outfile, src, { flag: "w+" });
};

const isFile = async (file: string) => {
  try {
    const stat = await fs.stat(file);

    return [stat.isFile(), null];
  } catch (error) {
    return [null, error];
  }
};

const canAccessDirectory = async (
  directory: string,
  flags: number = fs.constants.O_DIRECTORY
) => {
  try {
    await fs.access(directory, flags);
    return [directory, null];
  } catch (error) {
    console.error(`Error: cannot access directory: ${directory}`);
    return [null, error];
  }
};

const ensureDirectory = async (
  dir: string,
  flags: number = fs.constants.O_DIRECTORY
) => {
  try {
    const [hasAccess, error] = await canAccessDirectory(dir, flags);
    if (hasAccess) {
      return [true, null];
    }
    await fs.mkdir(path.join(dir), { recursive: true });
    return [true, null];
  } catch (error) {
    return [null, error];
  }
};

export const createTypingsFile = async (
  schemaDir: string,
  outfile: string,
  forceCreateDir: boolean
) => {
  try {
    const outDir = path.dirname(outfile);

    const [hasSchemaDirAccess, schemaDirError] = await (forceCreateDir
      ? ensureDirectory(schemaDir, fs.constants.O_RDWR)
      : canAccessDirectory(schemaDir));
    const [hasOutDirAcess, outDirError] = await (forceCreateDir
      ? ensureDirectory(outDir, fs.constants.O_RDWR)
      : canAccessDirectory(outDir, fs.constants.O_RDWR));

    if (hasSchemaDirAccess && hasOutDirAcess) {
      await generateTypingsFromSchema(schemaDir, outfile);
    }
  } catch (e) {
    console.error(e);
  }
};
