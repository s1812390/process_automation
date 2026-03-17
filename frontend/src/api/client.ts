import axios from 'axios'

const client = axios.create({
  baseURL: `${import.meta.env.BASE_URL}api`,
  headers: {
    'Content-Type': 'application/json',
  },
  paramsSerializer: (params) => {
    const qs = new URLSearchParams()
    Object.entries(params).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        value.forEach(v => qs.append(key, String(v)))
      } else if (value !== undefined && value !== null) {
        qs.set(key, String(value))
      }
    })
    return qs.toString()
  },
})

client.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error.response?.data || error.message)
    return Promise.reject(error)
  }
)

export default client
