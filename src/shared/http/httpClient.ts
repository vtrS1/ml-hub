import axios from 'axios';

export const mlHttpClient = axios.create({
  baseURL: 'https://api.mercadolibre.com',
  timeout: 10_000,
  headers: { 'Content-Type': 'application/json' },
});
