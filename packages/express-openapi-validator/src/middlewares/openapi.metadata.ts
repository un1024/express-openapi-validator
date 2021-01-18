import _zipObject from 'lodash.zipobject';
import { pathToRegexp } from 'path-to-regexp';
import { Response, NextFunction } from 'express';
import {
  OpenApiContext,
  OpenAPIV3,
  MethodNotAllowed,
  NotFound,
} from 'framework';
import {
  OpenApiRequest,
  OpenApiRequestHandler,
  OpenApiRequestMetadata,
} from '../types';
import { pathname } from './util';

export function applyOpenApiMetadata(
  openApiContext: OpenApiContext,
  responseApiDoc: OpenAPIV3.Document,
): OpenApiRequestHandler {
  return (req: OpenApiRequest, res: Response, next: NextFunction): void => {
    const path = pathname(req);
    if (openApiContext.shouldIgnoreRoute(path)) {
      return next();
    }
    const matched = lookupRoute(req);
    if (matched) {
      const { expressRoute, openApiRoute, pathParams, schema } = matched;
      if (!schema) {
        throw new MethodNotAllowed({
          path: req.path,
          message: `${req.method} method not allowed`,
        });
      }
      req.openapi = {
        expressRoute: expressRoute,
        openApiRoute: openApiRoute,
        pathParams: pathParams,
        schema: schema,
      };
      req.params = pathParams;
      if (responseApiDoc) {
        // add the response schema if validating responses
        (<any>req.openapi)._responseSchema = (<any>matched)._responseSchema;
      }
    } else if (openApiContext.isManagedRoute(path)) {
      throw new NotFound({
        path: req.path,
        message: 'not found',
      });
    }
    next();
  };

  function lookupRoute(req: OpenApiRequest): OpenApiRequestMetadata {
    const path = (req.originalUrl ?? req.url).split('?')[0];
    const method = req.method;
    const routeEntries = Object.entries(openApiContext.expressRouteMap);
    for (const [expressRoute, methods] of routeEntries) {
      const routePair = openApiContext.routePair(expressRoute);
      const openApiRoute = routePair.openApiRoute;
      const pathKey = openApiRoute.substring((<any>methods).basePath.length);
      const schema = openApiContext.apiDoc.paths[pathKey][method.toLowerCase()];
      const _schema = responseApiDoc?.paths[pathKey][method.toLowerCase()];

      const keys = [];
      const strict = !!req.app?.enabled('strict routing');
      const sensitive = !!req.app?.enabled('case sensitive routing');
      const pathOpts = {
        sensitive,
        strict,
      };
      const regexp = pathToRegexp(expressRoute, keys, pathOpts);
      const matchedRoute = regexp.exec(path);

      if (matchedRoute) {
        const paramKeys = keys.map((k) => k.name);
        const paramsVals = matchedRoute.slice(1).map(decodeURIComponent);
        const pathParams = _zipObject(paramKeys, paramsVals);

        const r = {
          schema,
          expressRoute,
          openApiRoute,
          pathParams,
        };
        (<any>r)._responseSchema = _schema;
        return r;
      }
    }

    return null;
  }
}
