import apiClient from './client';

export interface ContactBody {
  name:     string;
  email:    string;
  subject?: string;
  message:  string;
  website?: string;   // honeypot — always left empty by a real person
}

export const contactApi = {
  /** Send a Contact-form message. Works signed in or not. */
  send: async (body: ContactBody): Promise<string> => {
    const { data } = await apiClient.post<{ message: string }>('/api/contact', body);
    return data.message;
  },
};
