// Replace the entire api.ts file with:
const API_BASE_URL = 'http://localhost:8000';

// Enhanced API functions with proper error handling
export const api = {
  get: async (url: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}${url}`);
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

  post: async (url: string, data: any) => {
    try {
      const response = await fetch(`${API_BASE_URL}${url}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
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

  delete: async (url: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}${url}`, { method: 'DELETE' });
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
}

export interface QueryResponse {
  success: boolean;
  query?: string;
  result?: any[];
  chart?: any;
  chart_id?: string;
  reasoning?: string;
  row_count?: number;
  retrieved_tables?: string[];
  execution_time_ms?: number;
  error?: string;
  timestamp: string;
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
}

export interface Dashboard {
  dashboard_id: string;
  dashboard_name: string;
  description?: string;
  chart_ids: string[];
  created_at: string;
}

export interface DashboardCreateRequest {
  dashboard_name: string;
  description?: string;
  chart_ids?: string[];
  layout_type?: string;
  include_all?: boolean;
  selected_chart_ids?: string[];
}

// API functions with proper error handling
export const queryAPI = {
  sendQuery: async (data: QueryRequest) => {
    const response = await api.post('/query', data);
    return response;
  },

  getSavedCharts: async () => {
    const response = await api.get('/saved-charts');
    return response;
  },

  saveChart: async (chart: SavedChart) => {
    const response = await api.post('/saved-charts', chart);
    return response;
  },

  getSavedChart: async (id: string) => {
    const response = await api.get(`/saved-charts/${id}`);
    return response;
  },

  deleteSavedChart: async (id: string) => {
    const response = await api.delete(`/saved-charts/${id}`);
    return response;
  },

  clearAllCharts: async () => {
    const response = await api.delete('/saved-charts');
    return response;
  },
};

export const dashboardAPI = {
  createDashboard: async (data: DashboardCreateRequest) => {
    const response = await api.post('/dashboard/create', data);
    return response;
  },

  getDashboards: async () => {
    const response = await api.get('/dashboards');
    return response;
  },

  getDashboard: async (id: string) => {
    const response = await api.get(`/dashboards/${id}`);
    return response;
  },

  deleteDashboard: async (id: string) => {
    const response = await api.delete(`/dashboards/${id}`);
    return response;
  },
};

export const healthCheck = () => api.get('/');
