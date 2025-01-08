import ts, { isTypeNode } from "typescript";
import {
  isAsyncFunctionType,
  isOptional,
  isWithFunctionParameters,
  isWithName,
} from "./guards";
import {
  FunctionType,
  SingleType,
  TypeGeneratorContext,
  WebExtensionType,
} from "./types";
import { addJsDocAnnotation } from "../utils";
import { createSingleTyping } from "./index";

export const generateFunctionType = (
  type: FunctionType,
  ctx: TypeGeneratorContext
) => {
  const { currentNamespace, knownTypes, schemaCatalog, context, factory } = ctx;

  const isAsync = isAsyncFunctionType(type) && type.async === true;
  const name = type.name;

  let params: SingleType[] = [];
  let returnType: ts.TypeNode = factory.createKeywordTypeNode(
    ts.SyntaxKind.VoidKeyword
  );

  if (isWithFunctionParameters(type)) {
    // check the `params` list and find a function whose name is `callback`
    const maybeCallback = type.parameters.find(
      (param) => isWithName(param) && param.name === "callback"
    ) as WebExtensionType;

    if (
      maybeCallback &&
      isWithFunctionParameters(maybeCallback) &&
      maybeCallback.parameters.length === 1
    ) {
      // if the callback has a single parameter, use that as the return type
      let maybeReturnType = createSingleTyping(maybeCallback.parameters[0], {
        currentNamespace,
        knownTypes,
        schemaCatalog,
        factory,
        context: "inline",
      });

      // replace the pre-set default return type if a return type is found
      if (maybeReturnType && isTypeNode(maybeReturnType)) {
        returnType = maybeReturnType;
      }
    }

    params = type.parameters.filter(
      (param) => isWithName(param) && param.name !== "callback"
    );
  }

  if (isAsync) {
    // wrap a promise around the return type when the function is async
    returnType = factory.createTypeReferenceNode(
      factory.createIdentifier("Promise"),
      [returnType]
    );
  }

  if (context === "inline") {
    const lambdaFunctionEmpty = factory.createFunctionTypeNode(
      undefined,
      params.map((param) => {
        const derivedParamType = createSingleTyping(param as WebExtensionType, {
          currentNamespace,
          knownTypes,
          schemaCatalog,
          factory,
          context: "inline",
        });
        const paramType =
          derivedParamType && ts.isTypeNode(derivedParamType)
            ? derivedParamType
            : factory.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword);
        const paramDeclaration = factory.createParameterDeclaration(
          undefined,
          undefined,
          factory.createIdentifier(
            isWithName(param) ? param.name : `param${params.indexOf(param)}`
          ),
          isOptional(param)
            ? factory.createToken(ts.SyntaxKind.QuestionToken)
            : undefined,
          paramType,
          undefined
        );
        return addJsDocAnnotation(param, paramDeclaration);
      }),
      factory.createKeywordTypeNode(ts.SyntaxKind.VoidKeyword)
    );
    return lambdaFunctionEmpty;
  }

  if (context === "namespace") {
    // return an exported function declaration when used in a namespace
    return addJsDocAnnotation(
      type,
      factory.createFunctionDeclaration(
        [factory.createToken(ts.SyntaxKind.ExportKeyword)],
        undefined,
        factory.createIdentifier(name),
        undefined,
        [],
        returnType,
        undefined
      )
    );
  }

  if (context === "interface") {
    return addJsDocAnnotation(
      type,
      factory.createMethodSignature(
        undefined,
        factory.createIdentifier(name),
        undefined,
        undefined,
        [],
        returnType
      )
    );
  }

  throw new Error("Invalid type generator context");
};
