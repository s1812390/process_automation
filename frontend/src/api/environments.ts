import client from './client'

export interface PythonEnv {
  id: number
  name: string
  description: string | null
  python_version: string | null
  path: string | null
  package_count: number
  total_size_kb: number
  is_system?: boolean
  created_at: string | null
  updated_at: string | null
}

export interface EnvPackage {
  id: number
  env_id: number
  package_name: string
  version: string | null
  size_kb: number | null
  installed_at: string | null
  status: 'installing' | 'installed' | 'failed' | string
}

export interface SyncResult {
  added: number
  removed: number
  updated: number
  packages: EnvPackage[]
}

export const environmentsApi = {
  list: (): Promise<PythonEnv[]> =>
    client.get('/environments').then((r) => r.data),

  get: (id: number): Promise<PythonEnv> =>
    client.get(`/environments/${id}`).then((r) => r.data),

  create: (data: { name: string; description?: string }): Promise<PythonEnv> =>
    client.post('/environments', data).then((r) => r.data),

  delete: (id: number): Promise<void> =>
    client.delete(`/environments/${id}`).then(() => undefined),

  listPackages: (envId: number): Promise<EnvPackage[]> =>
    client.get(`/environments/${envId}/packages`).then((r) => r.data),

  installPackage: (
    envId: number,
    data: { package_name: string; version?: string }
  ): Promise<EnvPackage> =>
    client.post(`/environments/${envId}/packages`, data).then((r) => r.data),

  uninstallPackage: (envId: number, pkgId: number): Promise<void> =>
    client.delete(`/environments/${envId}/packages/${pkgId}`).then(() => undefined),

  sync: (envId: number): Promise<SyncResult> =>
    client.post(`/environments/${envId}/sync`).then((r) => r.data),
}
