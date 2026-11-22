export abstract class Request<TResponse = void> {
  declare readonly __response: TResponse;
}

export abstract class Query<TResponse> extends Request<TResponse> {}
export abstract class Command<TResponse = void> extends Request<TResponse> {}
