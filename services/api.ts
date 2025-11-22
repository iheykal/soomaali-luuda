
import { debugService } from './debugService';

export const instrumentedFetch = async (url: string, options: RequestInit) => {
  debugService.api({
    type: 'request',
    url,
    options
  });

  try {
    const response = await fetch(url, options);
    // clone the response to be able to read it twice
    const responseClone = response.clone();
    try {
        const responseData = await response.json();

        if (!response.ok) {
        debugService.error({
            type: 'response_error',
            url,
            status: response.status,
            statusText: response.statusText,
            data: responseData
        });
        throw { response, responseData };
        }

        debugService.api({
        type: 'response_success',
        url,
        status: response.status,
        data: responseData
        });

        return { response, responseData };
    } catch (e) {
        // if the response is not a json, just return the text
        const responseText = await responseClone.text();
        debugService.api({
            type: 'response_success',
            url,
            status: response.status,
            data: responseText
        });
        return { response, responseData: responseText };
    }
  } catch (error: any) {
    if (error.response) { // It's an error from a non-ok response
      throw error;
    }
    
    debugService.error({
      type: 'network_error',
      url,
      message: error.message,
      error
    });
    throw error;
  }
};
