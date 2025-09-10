const request = require('supertest');

jest.setTimeout(45000);

const BASE_URL = 'http://localhost:3000';

describe('RAG Query API Integration', () => {
  it('should process a query and return a valid answer with citations', async () => {
    const queryPayload = {
      query: 'What are the important dates or events mentioned?',
      options: {
        useMMR: true,
        useReranking: true,
        topK: 3,
        rerankedK: 1,
        includeMetrics: true
      }
    };
    let response;
    try {
      response = await request(BASE_URL)
        .post('/api/query')
        .send(queryPayload)
        .set('Accept', 'application/json');
    } catch (err) {
      console.error('API request error:', err);
      throw err;
    }
    console.log('API response:', response.body);
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('answer');
    expect(typeof response.body.answer).toBe('string');
    expect(response.body.answer.length).toBeGreaterThan(10);
    expect(response.body).toHaveProperty('citations');
    expect(Array.isArray(response.body.citations)).toBe(true);
    expect(response.body).toHaveProperty('metrics');
    expect(response.body.metrics).toHaveProperty('totalTime');
    expect(response.body.metrics.totalTime).toBeGreaterThan(0);
  });
});
