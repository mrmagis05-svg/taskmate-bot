export interface D1Result<T> {
  results: T[];
  success: boolean;
  meta: any;
}

export class D1 {
  constructor(private db: D1Database) {}

  async query<T = any>(query: string, ...params: any[]): Promise<T[]> {
    try {
      const stmt = this.db.prepare(query).bind(...params);
      const { results } = await stmt.all<T>();
      return results || [];
    } catch (e) {
      console.error('D1 Query Error:', e);
      throw e;
    }
  }

  async first<T = any>(query: string, ...params: any[]): Promise<T | null> {
    try {
      const stmt = this.db.prepare(query).bind(...params);
      const result = await stmt.first<T>();
      return result;
    } catch (e) {
      console.error('D1 First Error:', e);
      throw e;
    }
  }

  async run(query: string, ...params: any[]): Promise<D1Result<any>> {
    try {
      const stmt = this.db.prepare(query).bind(...params);
      const result = await stmt.run();
      return {
        results: [],
        success: result.success,
        meta: result.meta,
      };
    } catch (e) {
      console.error('D1 Run Error:', e);
      throw e;
    }
  }

  async batch(statements: D1PreparedStatement[]): Promise<D1Result<any>[]> {
    try {
      return await this.db.batch(statements);
    } catch (e) {
      console.error('D1 Batch Error:', e);
      throw e;
    }
  }

  prepare(query: string) {
    return this.db.prepare(query);
  }
}
