import http from 'http';

/** Class representing a HTTP JSON-RPC server */
declare class RpcServer {
  constructor(options?: {
    /** A map of method names to functions. */
    methods?: { [key: string]: (params?: object) => any },
    /** Context to be used as `this` for method functions. */
    context: any,
    /** The path for the server. */
    path: string,
    /** Callback for when requests are received. */
    onRequest?: (params?: object) => void,
    /** Callback for when requested methods throw errors. */
    onRequestError?: (err: Error, id: string) => void,
    /** Callback for when requests are successfully returned a result. */
    onResult: (response: any, id: string) => void,
    /** Callback for server errors. */
    onServerError: (err: Error) => void,
  });

  /** 
   * Stops listening on all ports.
   * @returns A promise that resolves once the server stops listening. */
  close(): Promise<void>;

  /**
   * Begins listening on a given port and host.
   * @param port The port number to listen on - an arbitrary available port is used if no port is
   * specified
   * @param host The host name or ip address to listen on - the unspecified IP address
   * (`0.0.0.0` or `(::)`) is used if no host is specified
   * @returns A promise that resolves to the assigned port once the server is listening
   */
  listen(port: number, host: string): Promise<number>;

  /**
   * Sets a method.
   * @param name The name of the method
   * @param method The function to be called for this method
   */
  setMethod(name: string, method: (params?: object) => any): void;

  server: http.Server;

  static INVALID_PARAMS: number;

  static INVALID_REQUEST: number;

  static METHOD_NOT_FOUND: number;

  static PARSE_ERROR: number;

  static SERVER_ERROR: number;

  static SERVER_ERROR_MAX: number;

}

export default RpcServer;