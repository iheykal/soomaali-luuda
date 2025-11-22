import { storage } from '../lib/storage';

/**
 * A wrapper around the native fetch API that automatically adds the
 * Authorization header and provides global error handling for
 * authentication errors.
 */
export const apiClient = {
  async fetch(url: string, options: RequestInit = {}): Promise<any> {
    // Get the auth token from storage
    const token = storage.getToken();

    // Prepare the headers
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (token) {
      (headers as any)['Authorization'] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      // If the response is not OK, handle it
      if (!response.ok) {
        // If the token is invalid or expired, log the user out
        if (response.status === 401 || response.status === 403) {
          console.error('Authentication error. Logging out.');
          storage.clearToken();
          storage.clearUser();
          // Reload the page to reset the application state
          window.location.reload();
        }
        
        // Try to parse the error message from the response
        let errorMessage = `API Error: ${response.status} ${response.statusText}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.message || errorData.error || errorMessage;
        } catch (e) {
          // Ignore if the response is not JSON
        }

        throw new Error(errorMessage);
      }

      // If the response is successful, parse and return the JSON
      return response.json();
    } catch (error) {
      console.error('API client error:', error);
      // Re-throw the error so that the calling code can handle it
      throw error;
    }
  },

  get(url: string, options: RequestInit = {}): Promise<any> {
    return this.fetch(url, { ...options, method: 'GET' });
  },

  post(url: string, body: any, options: RequestInit = {}): Promise<any> {
    return this.fetch(url, { ...options, method: 'POST', body: JSON.stringify(body) });
  },

  put(url: string, body: any, options: RequestInit = {}): Promise<any> {
    return this.fetch(url, { ...options, method: 'PUT', body: JSON.stringify(body) });
  },

  delete(url: string, options: RequestInit = {}): Promise<any> {
    return this.fetch(url, { ...options, method: 'DELETE' });
  },
};
