declare module 'pdf-parse-fork' {
  interface Options {
    max?: number;
  }
  
  interface Result {
    text: string;
    numpages: number;
    numrender: number;
    info: any;
    metadata: any;
    version: string;
  }
  
  function parse(buffer: Buffer, options?: Options): Promise<Result>;
  
  export = parse;
}