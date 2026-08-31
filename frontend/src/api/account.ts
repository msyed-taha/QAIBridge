import apiClient from './client';
import type { Role } from '../types';

export interface AccountProfile {
  id:         number;
  username:   string;
  email:      string;
  role:       Role;
  created_at: string | null;
}

interface ChangePasswordBody {
  current_password:     string;
  new_password:         string;
  confirm_new_password: string;
}

/** Self-service account endpoints — same for a user and an admin. */
export const accountApi = {
  me: async (): Promise<AccountProfile> => {
    const { data } = await apiClient.get<AccountProfile>('/api/account/me');
    return data;
  },

  updateProfile: async (username: string): Promise<AccountProfile> => {
    const { data } = await apiClient.patch<AccountProfile>('/api/account/profile', { username });
    return data;
  },

  changePassword: async (body: ChangePasswordBody): Promise<{ message: string }> => {
    const { data } = await apiClient.post<{ message: string }>('/api/account/change-password', body);
    return data;
  },

  /** Email a 5-digit deletion code to the account's own address. */
  deleteSendOtp: async (): Promise<{ message: string }> => {
    const { data } = await apiClient.post<{ message: string }>('/api/account/delete/send-otp');
    return data;
  },

  /** Confirm the code — the account is then permanently deleted. */
  deleteVerify: async (otp: string): Promise<{ message: string }> => {
    const { data } = await apiClient.post<{ message: string }>('/api/account/delete/verify', { otp });
    return data;
  },
};
