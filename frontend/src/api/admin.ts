import apiClient from './client';
import type { AdminStats, AdminUser, ContactMessage, Role } from '../types';

const BASE = '/api/admin';

export interface UserFilters {
  search?: string;
  role?:   Role;
  active?: boolean;
}

export const adminApi = {
  /** Dashboard counters + the 5 most recent signups. */
  stats: async (): Promise<AdminStats> => {
    const { data } = await apiClient.get<AdminStats>(`${BASE}/stats`);
    return data;
  },

  /** All users, newest first, optionally filtered. */
  listUsers: async (filters: UserFilters = {}): Promise<AdminUser[]> => {
    const { data } = await apiClient.get<AdminUser[]>(`${BASE}/users`, { params: filters });
    return data;
  },

  /** Create an account directly (no email OTP). role: 'user' | 'admin'. */
  createUser: async (body: {
    username: string; email: string; password: string; role: Role; is_active?: boolean;
  }): Promise<AdminUser> => {
    const { data } = await apiClient.post<AdminUser>(`${BASE}/users`, body);
    return data;
  },

  /** Change a user's active flag and/or role. */
  updateUser: async (id: number, patch: { is_active?: boolean; role?: Role }): Promise<AdminUser> => {
    const { data } = await apiClient.patch<AdminUser>(`${BASE}/users/${id}`, patch);
    return data;
  },

  /** Permanently delete a user. */
  deleteUser: async (id: number): Promise<void> => {
    await apiClient.delete(`${BASE}/users/${id}`);
  },

  /** Contact-form messages, newest first. */
  listMessages: async (): Promise<ContactMessage[]> => {
    const { data } = await apiClient.get<ContactMessage[]>(`${BASE}/messages`);
    return data;
  },

  /** Mark a message read or unread. */
  markMessage: async (id: number, is_read: boolean): Promise<ContactMessage> => {
    const { data } = await apiClient.patch<ContactMessage>(`${BASE}/messages/${id}`, { is_read });
    return data;
  },

  /** Delete a message. */
  deleteMessage: async (id: number): Promise<void> => {
    await apiClient.delete(`${BASE}/messages/${id}`);
  },
};
