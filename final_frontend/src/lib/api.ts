// Replace the entire api.ts file with:
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

// Revised API functions with authentication support
export const api = {
  get: async (url: string, token?: string | null) => {
    try {
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      
      const response = await fetch(`${API_BASE_URL}${url}`, { headers });
      if (response.status === 401 || response.status === 403) {
        throw new Error('Authentication required');
      }
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      return { data, success: true };
    } catch (error) {
      console.error('API GET error:', error);
      return { data: null, success: false, error: error.message };
    }
  },

  post: async (url: string, data: any, token?: string | null) => {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      
      const response = await fetch(`${API_BASE_URL}${url}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(data)
      });
      if (response.status === 401 || response.status === 403) {
        throw new Error('Authentication required');
      }
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const result = await response.json();
      return { data: result, success: true };
    } catch (error) {
      console.error('API POST error:', error);
      return { data: null, success: false, error: error.message };
    }
  },

  delete: async (url: string, token?: string | null) => {
    try {
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      
      const response = await fetch(`${API_BASE_URL}${url}`, { 
        method: 'DELETE',
        headers
      });
      if (response.status === 401 || response.status === 403) {
        throw new Error('Authentication required');
      }
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const result = await response.json();
      return { data: result, success: true };
    } catch (error) {
      console.error('API DELETE error:', error);
      return { data: null, success: false, error: error.message };
    }
  }
};

export interface QueryRequest {
  question: string;
  limit?: number;
  chart_type?: string;
  generate_insights?: boolean;
}

export interface QueryResponse {
  success: boolean;
  query?: string;
  result?: any[];
  chart?: any;
  chart_id?: string;
  reasoning?: string;
  insights?: string;
  suggestions?: string[];
  row_count?: number;
  retrieved_tables?: string[];
  execution_time_ms?: number;
  error?: string;
  timestamp: string;
  thought_logs?: any[];
  diagnose_data?: DiagnoseResponse | null;
}

export interface SavedChart {
  chart_id: string;
  question: string;
  chart_type: string;
  title: string;
  data: any[];
  query?: string;
  x_axis?: string;
  y_axis?: string;
  timestamp: string;
  insight?: string;
}

export interface Dashboard {
  dashboard_id: string;
  dashboard_name: string;
  description?: string;
  chart_ids: string[];
  created_at: string;
}

export interface DiagnoseRequest {
  question: string;
  anomaly_data: any[];
  source_id?: string;
}

export interface DiagnoseResponse {
  verdict: string;
  diagnostic_path: {
    title: string;
    finding: string;
    status: 'critical' | 'info' | 'success' | 'error';
  }[];
  investigation_steps: string[];
  timestamp: string;
}

export interface AnomalyItem {
  anomaly_key: string;
  metric: string;
  severity: string;
  state: 'NEW' | 'ONGOING' | 'RESOLVED';
  duration: string;
  description: string;
  financial_impact_dollars: number;
  suggested_query: string;
}

export interface DashboardCreateRequest {
  dashboard_name: string;
  description?: string;
  chart_ids?: string[];
  layout?: string;
  include_all?: boolean;
  selected_chart_ids?: string[];
}

// API functions with proper authentication support
export const queryAPI = {
  sendQuery: async (data: QueryRequest, token?: string | null) => {
    return await api.post('/query', data, token);
  },

  getSavedCharts: async (token?: string | null) => {
    return await api.get('/saved-charts', token);
  },

  getSchema: async (sourceId: string, enrich: boolean = false, token?: string | null) => {
    return await api.get(`/data-sources/${sourceId}/schema?enrich=${enrich}`, token);
  },

  saveChart: async (chart: SavedChart, token?: string | null) => {
    return await api.post('/saved-charts', chart, token);
  },

  getSavedChart: async (id: string, token?: string | null) => {
    return await api.get(`/saved-charts/${id}`, token);
  },

  deleteSavedChart: async (id: string, token?: string | null) => {
    return await api.delete(`/saved-charts/${id}`, token);
  },

  clearAllCharts: async (token?: string | null) => {
    return await api.delete('/saved-charts', token);
  },

  diagnoseAnomaly: async (data: DiagnoseRequest, token?: string | null) => {
    return await api.post('/diagnose', data, token);
  },
};

export const modeAPI = {
  getStatus: async (token?: string | null) => {
    return await api.get('/mode/status', token);
  },
};

export const dashboardAPI = {
  createDashboard: async (data: DashboardCreateRequest, token?: string | null) => {
    return await api.post('/dashboard/create', data, token);
  },

  getDashboards: async (token?: string | null) => {
    return await api.get('/dashboards', token);
  },

  getDashboard: async (id: string, token?: string | null) => {
    return await api.get(`/dashboards/${id}`, token);
  },

  deleteDashboard: async (id: string, token?: string | null) => {
    return await api.delete(`/dashboards/${id}`, token);
  },
};

export const dataSourcesAPI = {
  listSources: async (token?: string | null) => {
    return await api.get('/data-sources', token);
  },
  
  connectDatabase: async (data: any, token?: string | null) => {
    return await api.post('/data-sources/connect', data, token);
  },
  
  uploadFile: async (formData: FormData, token?: string | null) => {
    try {
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      
      const response = await fetch(`${API_BASE_URL}/data-sources/upload`, {
        method: 'POST',
        headers,
        body: formData
      });
      const result = await response.json();
      return { data: result, success: response.ok };
    } catch (error) {
      return { data: null, success: false, error: error.message };
    }
  },

  activateSource: async (id: string, token?: string | null) => {
    return await api.post(`/data-sources/${id}/activate`, {}, token);
  },

  getSmartQuestions: async (id: string, token?: string | null, refresh: boolean = false) => {
    return await api.get(`/data-sources/${id}/smart-questions?refresh=${refresh}`, token);
  },

  scanAnomalies: async (id: string, token?: string | null) => {
    return await api.get(`/data-sources/${id}/scan-anomalies`, token);
  },

  deactivateSource: async (token?: string | null) => {
    return await api.post('/data-sources/deactivate', {}, token);
  }
};

export const healthCheck = (token?: string | null) => api.get('/', token);
