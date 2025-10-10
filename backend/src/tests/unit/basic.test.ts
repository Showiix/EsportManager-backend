import { describe, it, expect } from '@jest/globals';

describe('Basic Test Suite', () => {
  it('should pass a basic test', () => {
    expect(1 + 1).toBe(2);
  });

  it('should test string operations', () => {
    const message = 'Hello, Esports Simulator!';
    expect(message).toContain('Esports');
    expect(message.length).toBeGreaterThan(10);
  });
});