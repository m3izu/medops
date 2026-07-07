async function test() {
  const baseURL = 'http://localhost:5000/api';
  let cookie = '';

  const request = async (url, options = {}) => {
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };
    if (cookie) {
      headers['Cookie'] = cookie;
    }
    const response = await fetch(`${baseURL}${url}`, {
      ...options,
      headers,
    });
    const status = response.status;
    const ok = response.ok;
    let data;
    try {
      data = await response.json();
    } catch (e) {
      data = await response.text();
    }
    if (!ok) {
      const error = new Error(`HTTP Error ${status}`);
      error.status = status;
      error.data = data;
      throw error;
    }
    return { data, headers: response.headers };
  };

  try {
    console.log('Logging in as admin...');
    const loginRes = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        username: 'admin',
        password: 'Admin@123'
      })
    });
    
    const setCookie = loginRes.headers.get('set-cookie');
    if (setCookie) {
      cookie = setCookie.split(';')[0];
    }
    console.log('Logged in.');

    console.log('Attempting to initiate a stocktake...');
    const initRes = await request('/stocktakes', { method: 'POST' });
    console.log('SUCCESS! Stocktake initiated:', initRes.data);
  } catch (err) {
    console.error('ERROR initiating stocktake:', err.status ? {
      status: err.status,
      data: err.data
    } : err.message);
  }
}

test();
