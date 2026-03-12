import client from './client'

export interface GlobalVar {
  id: number
  key: string
  value: string
  description?: string
  created_at: string
  updated_at?: string
}

export interface GlobalVarCreate {
  key: string
  value: string
  description?: string
}

export const variablesApi = {
  list: () => client.get<GlobalVar[]>('/variables').then(r => r.data),
  create: (data: GlobalVarCreate) => client.post<GlobalVar>('/variables', data).then(r => r.data),
  update: (id: number, data: Partial<GlobalVarCreate>) =>
    client.put<GlobalVar>(`/variables/${id}`, data).then(r => r.data),
  delete: (id: number) => client.delete(`/variables/${id}`),
}
