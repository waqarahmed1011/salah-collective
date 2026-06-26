import axios from 'axios'

const getKey = () =>
  sessionStorage.getItem('adminKey') ?? import.meta.env.VITE_ADMIN_KEY ?? ''

const client = axios.create({ baseURL: import.meta.env.VITE_API_URL })

client.interceptors.request.use((config) => {
  config.headers['X-Admin-Key'] = getKey()
  return config
})

export const getDashboard = () => client.get('/admin/dashboard')

export const getGroups = () => client.get('/admin/groups')
export const getGroup = (id) => client.get(`/admin/groups/${id}`)
export const renameGroup = (id, name) => client.post(`/admin/groups/${id}/rename`, { name })
export const disbandGroup = (id) => client.delete(`/admin/groups/${id}`)

export const getMembers = (params) => client.get('/admin/members', { params })
export const getMember = (id) => client.get(`/admin/members/${id}`)
export const updateMember = (id, data) => client.put(`/admin/members/${id}`, data)
export const moveMember = (id, groupId) => client.post(`/admin/members/${id}/move`, { group_id: groupId })
export const unmatchMember = (id) => client.post(`/admin/members/${id}/unmatch`)
export const deleteMember = (id) => client.delete(`/admin/members/${id}`)

export const getWaitlist = () => client.get('/admin/waitlist')

export const getGeocodeFailures = () => client.get('/admin/geocode-failures')
export const retryGeocode = (id, address) =>
  client.post(`/admin/geocode-failures/${id}/retry`, { address })

export const runMatching = () => client.post('/admin/run-matching')
export const runBatch = () => client.post('/admin/run-batch')

export const getRuns = () => client.get('/admin/runs')

export const verifyKey = (key) =>
  axios.get(`${import.meta.env.VITE_API_URL}/admin/dashboard`, {
    headers: { 'X-Admin-Key': key },
  })
