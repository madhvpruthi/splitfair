import React, { createContext, useState, useEffect, useContext } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

export const API_BASE = import.meta.env.VITE_API_URL || 
  (window.location.hostname === 'localhost' || window.location.hostname.match(/^\d+\.\d+\.\d+\.\d+$/)
    ? `http://${window.location.hostname}:8000/api`
    : `${window.location.origin}/api`);

// Create a pre-configured axios instance
export const api = axios.create({
  baseURL: API_BASE,
});

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(() => localStorage.getItem('access_token'));

  // Configure axios interceptor to add authorization headers
  useEffect(() => {
    const requestInterceptor = api.interceptors.request.use(
      (config) => {
        const storedToken = localStorage.getItem('access_token');
        if (storedToken) {
          config.headers.Authorization = `Bearer ${storedToken}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    const responseInterceptor = api.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;
        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;
          const refresh = localStorage.getItem('refresh_token');
          if (refresh) {
            try {
              const res = await axios.post(`${API_BASE}/token/refresh/`, { refresh });
              const newAccess = res.data.access;
              localStorage.setItem('access_token', newAccess);
              setToken(newAccess);
              originalRequest.headers.Authorization = `Bearer ${newAccess}`;
              return api(originalRequest);
            } catch (err) {
              // Refresh token expired or invalid
              logout();
            }
          } else {
            logout();
          }
        }
        return Promise.reject(error);
      }
    );

    return () => {
      api.interceptors.request.eject(requestInterceptor);
      api.interceptors.response.eject(responseInterceptor);
    };
  }, [token]);

  // Load user profile on mount or token change
  useEffect(() => {
    const loadUser = async () => {
      if (token) {
        try {
          const res = await api.get('/profile/');
          setUser(res.data);
        } catch (err) {
          console.error("Error loading user profile", err);
          logout();
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    };
    loadUser();
  }, [token]);

  const login = async (username, password) => {
    const res = await axios.post(`${API_BASE}/login/`, { username, password });
    const { access, refresh } = res.data;
    localStorage.setItem('access_token', access);
    localStorage.setItem('refresh_token', refresh);
    setToken(access);
    const profileRes = await axios.get(`${API_BASE}/profile/`, {
      headers: { Authorization: `Bearer ${access}` }
    });
    setUser(profileRes.data);
    return profileRes.data;
  };

  const register = async (username, email, password) => {
    const res = await axios.post(`${API_BASE}/register/`, {
      username,
      email,
      password
    });
    return res.data;
  };

  const verifyOtp = async (username, otp) => {
    const res = await axios.post(`${API_BASE}/register/verify-otp/`, { username, otp });
    const { access, refresh } = res.data.token;
    localStorage.setItem('access_token', access);
    localStorage.setItem('refresh_token', refresh);
    setToken(access);
    setUser(res.data.user);
    return res.data.user;
  };

  const resendOtp = async (username) => {
    const res = await axios.post(`${API_BASE}/register/resend-otp/`, { username });
    return res.data;
  };

  const logout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    setToken(null);
    setUser(null);
  };

  const value = {
    user,
    token,
    loading,
    login,
    register,
    verifyOtp,
    resendOtp,
    logout,
    refreshUser: async () => {
      if (token) {
        const res = await api.get('/profile/');
        setUser(res.data);
      }
    }
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
