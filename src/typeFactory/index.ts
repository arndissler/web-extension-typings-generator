import ts, { isTypeNode, PropertySignature } from "typescript";
import {
  createIdentifier,
  findIdentifierTreatment,
  IdentifierTreatment,
  sanitizeDescription,
} from "../utils";
import { WebExtensionSchemaMapping, WebExtensionType } from "./types";
import {
  isArrayType,
  isBooleanType,
  isEnumStringType,
  isWithInstanceOf,
  isIntegerType,
  isNullType,
  isNumberType,
  isObjectType,
  isOptional,
  isReferenceType,
  isStringType,
  isUnionType,
  isWithId,
  isWithPatternProperties,
  isWithAdditionalProperties,
  isFunctionType,
  isWithFunctions,
  isWithProps,
  isAsyncFunctionType,
  isWithFunctionParameters,
  isWithName,
  isAnyType,
  isWithDescription,
  isWithDeprecation,
  isUnsupported,
} from "./guards";

type TypeMapper = (
  _type: WebExtensionType,
  factory: ts.NodeFactory
) => ts.TypeReferenceNode | ts.KeywordTypeNode | "skip";

type StaticTypeMapping = {
  type: Partial<WebExtensionType> & { [key: string]: any };
  mapper: TypeMapper;
};

const typeMappings: StaticTypeMapping[] = [
  {
    type: {
      id: "ImageData",
      isInstanceOf: "ImageData",
      postprocess: "convertImageDataToURL",
      type: "object",
    },
    mapper: (_theType: WebExtensionType, _factory: ts.NodeFactory) => {
      return "skip";
    },
  },
  {
    type: {
      unsupported: true,
    },
    mapper: (_theType: WebExtensionType, _factory: ts.NodeFactory) => {
      return "skip";
    },
  },
];

const findStaticTypeMapping = (type: WebExtensionType) => {
  const mappedType = typeMappings.find((mapping) => {
    const keysSource = Object.keys(type);
    const keysMapping = Object.keys(mapping.type);

    if (keysSource.length < keysMapping.length) {
      return false;
    }

    if (
      keysMapping.every((key) => keysSource.includes(key)) &&
      keysMapping.every((key) => (type as any)[key] === mapping.type[key])
    ) {
      return true;
    }

    return false;
  });

  if (mappedType) {
    return mappedType.mapper;
  }

  return null;
};

export const createSingleTyping = (
  theType: WebExtensionType,
  factory: ts.NodeFactory,
  ctx: {
    currentNamespace: string;
    knownTypes: WebExtensionType[];
    schemaCatalog: WebExtensionSchemaMapping;
    context: "namespace" | "interface" | "inline";
  }
):
  | undefined
  // | ts.SyntaxKind
  | ts.ArrayTypeNode
  | ts.FunctionTypeNode
  | ts.FunctionDeclaration
  | ts.PropertySignature
  | ts.MethodSignature
  | ts.MethodDeclaration
  | ts.InterfaceDeclaration
  | ts.IntersectionTypeNode
  | ts.TypeReferenceNode
  | ts.LiteralTypeNode
  | ts.TypeLiteralNode
  | ts.KeywordTypeNode
  | ts.UnionTypeNode
  | ts.TypeAliasDeclaration => {
  const { currentNamespace, knownTypes, schemaCatalog, context } = ctx;
  try {
    const mapper = findStaticTypeMapping(theType);
    if (mapper) {
      const mappedType = mapper(theType, factory);
      if (typeof mappedType === "string" && mappedType === "skip") {
        // nothing to do here
        return undefined;
      } else {
        return mappedType;
      }
    } else if (isNullType(theType)) {
      if (context === "inline") {
        return factory.createLiteralTypeNode(factory.createNull());
      }
    }

    if (isAnyType(theType)) {
      if (context === "inline") {
        return factory.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword);
      } else {
        if (isWithId(theType)) {
          return addJsDocAnnotation(
            theType,
            factory.createTypeAliasDeclaration(
              undefined,
              factory.createIdentifier(theType.id),
              undefined,
              factory.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword)
            )
          );
        } else {
          throw new Error("Type without id found (of type: any)");
        }
      }
    }
    // resolve a function type
    else if (isFunctionType(theType)) {
      const _type = factory.createFunctionTypeNode(
        undefined,
        [],
        factory.createKeywordTypeNode(ts.SyntaxKind.VoidKeyword)
      );
      if (ctx.context === "inline") {
        return _type;
      } else {
        const isAsync = isAsyncFunctionType(theType) && theType.async === true;

        let returnType: ts.TypeNode = factory.createKeywordTypeNode(
          ts.SyntaxKind.VoidKeyword
        );
        if (isWithFunctionParameters(theType)) {
          const maybeCallback = theType.parameters.find(
            (param) => isWithName(param) && param.name === "callback"
          ) as WebExtensionType;
          if (
            maybeCallback &&
            isWithFunctionParameters(maybeCallback) &&
            maybeCallback.parameters.length === 1
          ) {
            let maybeReturnType = createSingleTyping(
              maybeCallback.parameters[0],
              factory,
              { currentNamespace, knownTypes, schemaCatalog, context: "inline" }
            );
            if (maybeReturnType && isTypeNode(maybeReturnType)) {
              returnType = maybeReturnType;
            }
          }
        }

        if (isAsync) {
          returnType = factory.createTypeReferenceNode(
            factory.createIdentifier("Promise"),
            [returnType]
          );
        }

        if (context === "namespace") {
          return addJsDocAnnotation(
            theType,
            factory.createFunctionDeclaration(
              [factory.createToken(ts.SyntaxKind.ExportKeyword)],
              undefined,
              factory.createIdentifier(theType.name),
              undefined,
              [],
              returnType,
              undefined
            )
          );
        } else {
          return addJsDocAnnotation(
            theType,
            factory.createMethodSignature(
              undefined,
              factory.createIdentifier(theType.name),
              undefined,
              undefined,
              [],
              returnType
            )
          );
        }
      }
    }
    // resolve an array type
    else if (isArrayType(theType)) {
      const _type = factory.createArrayTypeNode(
        createSingleTyping(theType.items, factory, {
          currentNamespace,
          knownTypes,
          schemaCatalog,
          context: "inline",
        }) as ts.TypeNode
      );

      if (context === "inline") {
        return _type;
      }

      return addJsDocAnnotation(
        theType,
        factory.createTypeAliasDeclaration(
          undefined,
          factory.createIdentifier(theType.id),
          undefined,
          _type
        )
      );
    }
    // resolve a union type
    else if (isUnionType(theType)) {
      const _type = factory.createUnionTypeNode(
        theType.choices.map(
          // TODO: remove ugly type assertion
          (choice) =>
            createSingleTyping(choice, factory, {
              currentNamespace,
              knownTypes,
              schemaCatalog,
              context: "inline",
            })! as ts.TypeNode
        )
      );

      if (context === "inline") {
        return _type;
      }

      return addJsDocAnnotation(
        theType,
        factory.createTypeAliasDeclaration(
          undefined,
          factory.createIdentifier(theType.id),
          undefined,
          _type
        )
      );
    }
    // resolve a reference type
    else if (isReferenceType(theType)) {
      const referenceLink = theType.$ref.split(".");
      if (referenceLink.length === 1) {
        // if it's a reference to a type in the same namespace we need to check whether it exists or not
        const localType = schemaCatalog[currentNamespace].types.find(
          (type) => isWithId(type) && type.id === theType.$ref
        );
        const manifestType = schemaCatalog["manifest"].types.find(
          (type) => isWithId(type) && type.id === theType.$ref
        );

        if (localType === undefined && manifestType !== undefined) {
          console.warn(
            `Warning: schema incorrect, referenced local type: ${theType.$ref} in '${currentNamespace}', but should reference manifest.${theType.$ref}`
          );
          theType.$ref = `manifest.${theType.$ref}`;
        }
      }
      const referenceType = factory.createTypeReferenceNode(theType.$ref);
      if (context === "inline") {
        return referenceType;
      } else {
        return factory.createPropertySignature(
          undefined,
          factory.createIdentifier(theType.id),
          undefined,
          referenceType
        );
      }
    }
    // check if it is a string type, or a string enum type
    else if (isStringType(theType)) {
      if (isEnumStringType(theType)) {
        const _type = factory.createUnionTypeNode(
          theType.enum.map((value) =>
            factory.createLiteralTypeNode(factory.createStringLiteral(value))
          )
        );

        if (context === "inline") {
          return _type;
        }

        return addJsDocAnnotation(
          theType,
          factory.createTypeAliasDeclaration(
            [factory.createToken(ts.SyntaxKind.ExportKeyword)],
            factory.createIdentifier(theType.id),
            undefined,
            _type
          )
        );
      } else {
        // simple string type
        if (context === "inline") {
          // if it's an inline type, return the type directly
          return factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword);
        }

        // if it's not an inline type, create a type alias
        return addJsDocAnnotation(
          theType,
          factory.createTypeAliasDeclaration(
            [factory.createToken(ts.SyntaxKind.ExportKeyword)],
            factory.createIdentifier(theType.id),
            undefined,
            factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword)
          )
        );
      }
    }
    // check if it is a boolean type
    else if (isBooleanType(theType)) {
      if (context === "inline") {
        return factory.createKeywordTypeNode(ts.SyntaxKind.BooleanKeyword);
      } else {
        return addJsDocAnnotation(
          theType,
          factory.createTypeAliasDeclaration(
            undefined,
            factory.createIdentifier(theType.id),
            undefined,
            factory.createKeywordTypeNode(ts.SyntaxKind.BooleanKeyword)
          )
        );
      }
    }
    // check if it is an object type
    else if (isObjectType(theType)) {
      let _type = undefined;
      let objectDefinition = {
        functions: new Array<ts.MethodSignature>(),
        properties: new Array<ts.PropertySignature>(),
      };

      if (isWithInstanceOf(theType)) {
        _type = factory.createTypeReferenceNode(theType.isInstanceOf);
      }

      if (isWithFunctions(theType)) {
        const functions = theType.functions || [];
        objectDefinition.functions = functions
          .map((func) => {
            const singleTyping = createSingleTyping(func, factory, {
              currentNamespace,
              knownTypes,
              schemaCatalog,
              context: "interface",
            });
            if (singleTyping && ts.isMethodSignature(singleTyping)) {
              return addJsDocAnnotation(func, singleTyping);
            }

            console.log(`Not a function: ${func.name}`);
            return undefined;
          })
          .filter((item) => item !== undefined);
      }

      if (isWithPatternProperties(theType)) {
        const props = Object.entries(theType.patternProperties);
        const valueTypes = props.reduce((acc, [_, value]) => {
          const propType = createSingleTyping(value, factory, "interface");
          if (propType) {
            acc.push(propType);
          }
          return acc;
        }, new Array<ts.Node>());

        _type = factory.createTypeLiteralNode([
          factory.createIndexSignature(
            undefined,
            [
              factory.createParameterDeclaration(
                undefined,
                undefined,
                factory.createIdentifier("key"),
                undefined,
                factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
                undefined
              ),
            ],
            factory.createUnionTypeNode(
              valueTypes.filter((value) => ts.isTypeNode(value))
            )
          ),
        ]);
      }

      if (isWithAdditionalProperties(theType)) {
        let additionalType = undefined;

        if (
          "boolean" === typeof theType.additionalProperties &&
          theType.additionalProperties === true
        ) {
          // when it's only "additionalProperties: true", we allow any additional properties
          additionalType = factory.createTypeLiteralNode([
            factory.createIndexSignature(
              undefined,
              [
                factory.createParameterDeclaration(
                  undefined,
                  undefined,
                  factory.createIdentifier("key"),
                  undefined,
                  factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
                  undefined
                ),
              ],
              factory.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword)
            ),
          ]);
        } else if (
          "object" === typeof theType.additionalProperties &&
          theType.additionalProperties.type
        ) {
          const propType = createSingleTyping(
            theType.additionalProperties,
            factory,
            "inline"
          );
          if (propType && ts.isTypeNode(propType)) {
            additionalType = factory.createTypeLiteralNode([
              factory.createIndexSignature(
                undefined,
                [
                  factory.createParameterDeclaration(
                    undefined,
                    undefined,
                    factory.createIdentifier("key"),
                    undefined,
                    factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
                    undefined
                  ),
                ],
                propType
              ),
            ]);
          } else {
            additionalType = factory.createKeywordTypeNode(
              ts.SyntaxKind.AnyKeyword
            );
          }
        } else if (
          "boolean" !== typeof theType.additionalProperties &&
          isReferenceType(theType.additionalProperties)
        ) {
          additionalType = factory.createTypeReferenceNode(
            theType.additionalProperties.$ref
          );
        }

        if (additionalType) {
          if (_type) {
            // create an intersection type
            _type = factory.createIntersectionTypeNode([_type, additionalType]);
          } else {
            _type = additionalType;
          }
        }
      }

      if (isWithProps(theType)) {
        const props: PropertySignature[] = [];
        Object.entries(theType.properties).forEach(([propName, subType]) => {
          // console.log(`Create property signature: ${propName}, ${subType}`);
          const _type = createSingleTyping(subType, factory, {
            currentNamespace,
            knownTypes,
            schemaCatalog,
            context: "inline",
          });

          if (_type == undefined) {
            if (isUnsupported(subType)) {
              console.warn(
                `Warning: skipping unsupported property ${currentNamespace}.${theType.id}.${propName}`
              );
            } else {
              console.error(
                `Error: cannot create property type for ${currentNamespace}.${theType.id}.${propName}`
              );
            }
          } else {
            const identifier = createIdentifier(propName, factory);
            props.push(
              addJsDocAnnotation(
                subType,
                factory.createPropertySignature(
                  undefined,
                  identifier,
                  isOptional(_type)
                    ? factory.createToken(ts.SyntaxKind.QuestionToken)
                    : undefined,
                  _type as ts.TypeNode
                )
              )
            );
          }
          // }
        });

        objectDefinition.properties = props;
      }

      if (context === "inline") {
        return factory.createTypeLiteralNode([
          ...objectDefinition.properties,
          ...objectDefinition.functions,
        ]);
      } else {
        const _props = [
          ...objectDefinition.properties,
          ...objectDefinition.functions,
        ];
        const maybeInterface = factory.createInterfaceDeclaration(
          [factory.createToken(ts.SyntaxKind.ExportKeyword)],
          factory.createIdentifier(theType.id),
          undefined,
          undefined,
          _props
        );
        return addJsDocAnnotation(theType, maybeInterface);
      }
    }
    // check if it is a number type
    else if (isIntegerType(theType) || isNumberType(theType)) {
      if (context === "inline") {
        return factory.createKeywordTypeNode(ts.SyntaxKind.NumberKeyword);
      } else {
        return factory.createTypeAliasDeclaration(
          [factory.createToken(ts.SyntaxKind.ExportKeyword)],
          factory.createIdentifier(theType.id),
          undefined,
          factory.createKeywordTypeNode(ts.SyntaxKind.NumberKeyword)
        );
      }
    } else {
      if (isWithId(theType) && theType.id && context !== "inline") {
        return factory.createInterfaceDeclaration(
          undefined,
          theType.id,
          undefined,
          undefined,
          []
        );
      }
    }
  } catch (ex: any) {
    if (isWithId(theType)) {
      console.error(
        `Error creating typing for ${theType.id}: ${ex.message}, ${
          (ex as any as Error).stack
        }`
      );
    }
    if (context === "inline") {
      return addJsDocAnnotation(
        { description: `From exception: ${ex.message}` },
        factory.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword)
      );
    } else {
      if (isWithId(theType)) {
        // if we have an ID then we can use `any`, otherwise we should fail
        return factory.createPropertySignature(
          undefined,
          factory.createIdentifier(theType.id),
          undefined,
          factory.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword)
        );
      } else {
        /* ouch - but silent for now */
      }
    }
  }

  console.error(
    `Failed to create typing for ${
      isWithId(theType)
        ? theType.id
        : `unknown (maybe: ${JSON.stringify(theType)})`
    }`
  );

  return undefined;
};

const addJsDocAnnotation = <T extends ts.Node>(type: any, returnType: T): T => {
  let description = "";
  let deprecationMessage = "";

  if (isWithDeprecation(type)) {
    deprecationMessage = `*\n* @deprecated ${type.deprecated}`;
  }
  if (isWithDescription(type)) {
    description = `*\n* ${sanitizeDescription(type.description)}`;
  }

  const comment = `${description}${deprecationMessage}`.trim();

  if (comment.length === 0) {
    return returnType;
  } else {
    return ts.addSyntheticLeadingComment(
      returnType,
      ts.SyntaxKind.MultiLineCommentTrivia,
      comment,
      true
    );
  }
};
