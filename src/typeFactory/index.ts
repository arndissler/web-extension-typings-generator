import ts from "typescript";
import {
  NumberType,
  SingleType,
  TypeGeneratorContext,
  WebExtensionType,
} from "./types";
import {
  isArrayType,
  isBooleanType,
  isIntegerType,
  isNullType,
  isNumberType,
  isObjectType,
  isReferenceType,
  isStringType,
  isUnionType,
  isWithId,
  isFunctionType,
  isAnyType,
  isWithFunctionParameters,
  isWithName,
  isStaticValueType,
} from "./guards";
import { generateAnyType } from "./generateAny";
import { generateArrayType } from "./generateArray";
import { generateBooleanType } from "./generateBoolean";
import { generateFunctionType } from "./generateFunction";
import { generateNumberType } from "./generateNumber";
import { generateObjectType } from "./generateObject";
import { generateReferenceType } from "./generateReference";
import { generateStaticValueType } from "./generateStaticValueType";
import { generateStringType } from "./generateString";
import { generateUnionType } from "./generateUnion";

type WebExtensionTypeTransformer = (
  type: WebExtensionType,
  factory: ts.NodeFactory
) => WebExtensionType;

type TypeMapper = (
  _type: WebExtensionType,
  factory: ts.NodeFactory
) =>
  | ts.TypeReferenceNode
  | ts.KeywordTypeNode
  | "skip"
  | WebExtensionTypeTransformer;

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
  {
    type: {
      name: "onMessageExternal",
      type: "function",
    },
    mapper:
      (theType: WebExtensionType, _factory: ts.NodeFactory) =>
      (theType: WebExtensionType, _factory: ts.NodeFactory) => {
        if (isWithFunctionParameters(theType)) {
          const parameters = theType.parameters.map((param) => {
            if (isWithName(param) && param.name === "sendResponse") {
              return {
                ...param,
                parameters: [
                  {
                    name: "response",
                    type: "any",
                    optional: true,
                  },
                ],
              };
            }
            return param;
          });
          return { ...theType, parameters };
        }
        return { ...theType };
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
  type: WebExtensionType,
  ctx: TypeGeneratorContext
):
  | undefined
  | ts.TypeNode
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
  | ts.VariableStatement
  | ts.TypeAliasDeclaration => {
  const { currentNamespace, knownTypes, schemaCatalog, context, factory } = ctx;
  let theType = type;

  try {
    const mapper = findStaticTypeMapping(theType);

    if (mapper) {
      const mappedType = mapper(theType, factory);
      if (typeof mappedType === "string" && mappedType === "skip") {
        // nothing to do here
        return undefined;
      } else if (typeof mappedType === "function") {
        theType = mappedType(theType, factory);
      } else {
        return mappedType;
      }
    } else if (isNullType(theType)) {
      if (context === "inline") {
        return factory.createLiteralTypeNode(factory.createNull());
      }
    }

    if (isAnyType(theType)) {
      return generateAnyType(theType, ctx);
    }
    // resolve a function type
    else if (isFunctionType(theType)) {
      return generateFunctionType(theType, ctx);
    }
    // resolve an array type
    else if (isArrayType(theType)) {
      return generateArrayType(theType, ctx);
    }
    // resolve a union type
    else if (isUnionType(theType)) {
      return generateUnionType(theType, ctx);
    }
    // resolve a reference type
    else if (isReferenceType(theType)) {
      return generateReferenceType(theType, ctx);
    }
    // check if it is a string type, or a string enum type
    else if (isStringType(theType)) {
      return generateStringType(theType, ctx);
    }
    // check if it is a boolean type
    else if (isBooleanType(theType)) {
      return generateBooleanType(theType, ctx);
    }
    // check if it is an object type
    else if (isObjectType(theType)) {
      return generateObjectType(theType, ctx);
    }
    // check if it is a number type
    else if (isIntegerType(theType) || isNumberType(theType)) {
      return generateNumberType(theType as NumberType, ctx);
    }
    // check if there is a static value
    else if (isStaticValueType(theType)) {
      return generateStaticValueType(theType, ctx);
    }
  } catch (ex: any) {
    console.warn(
      `Warning: There was an error creating a typing, namespace ${currentNamespace}, context ${context}, id: ${
        isWithId(theType) ? theType.id : "<unknown>"
      }, ${ex.message}, ${ex.stack}`
    );
    // }
  }
  // }

  console.error(
    `Fatal: failed to create typing for ${
      isWithId(theType)
        ? theType.id
        : `unknown (maybe: ${JSON.stringify(theType)})`
    }`
  );

  return undefined;
};
