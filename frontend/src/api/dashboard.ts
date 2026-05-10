import axios from 'axios';
import type { BenchmarkReport, SuiteResult, SFODAlgorithm } from '../types';

const BASE = '/api/dashboard';

export const dashboardApi = {
  /** Run a single SFOD benchmark */
  benchmark: async (
    algorithm: SFODAlgorithm,
    problem_size: number,
  ): Promise<BenchmarkReport> => {
    const { data } = await axios.post<{ status: string; report: BenchmarkReport }>(
      `${BASE}/benchmark`,
      { algorithm, problem_size },
    );
    return data.report;
  },

  /** Run all 4 SFOD benchmarks */
  suite: async (): Promise<SuiteResult> => {
    const { data } = await axios.get<{ status: string; suite: SuiteResult }>(
      `${BASE}/benchmark/suite`,
    );
    return data.suite;
  },

  /** Theoretical speedup for algorithm at size n */
  theoretical: async (algorithm: string, n: number) => {
    const { data } = await axios.get(`${BASE}/theoretical/${algorithm}`, {
      params: { n },
    });
    return data;
  },
};
