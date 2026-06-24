import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const UserProfileContext = createContext(null)

export function UserProfileProvider({ user, children }) {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) { setLoading(false); return }
    fetchProfile()
  }, [user])

  async function fetchProfile() {
    setLoading(true)
    const { data } = await supabase
      .from('user_profiles')
      .select('*, person:person_id(id, name), supervisor:supervisor_person_id(id, name)')
      .eq('user_id', user.id)
      .single()
    setProfile(data)
    setLoading(false)
  }

  async function createProfile(personId, supervisorPersonId) {
    const { data } = await supabase
      .from('user_profiles')
      .insert({ user_id: user.id, person_id: personId, supervisor_person_id: supervisorPersonId })
      .select('*, person:person_id(id, name), supervisor:supervisor_person_id(id, name)')
      .single()
    setProfile(data)
    return data
  }

  const value = {
    profile,
    loading,
    selfPersonId: profile?.person_id ?? null,
    supervisorPersonId: profile?.supervisor_person_id ?? null,
    selfName: profile?.person?.name ?? null,
    supervisorName: profile?.supervisor?.name ?? null,
    hasProfile: !!profile,
    createProfile,
    refetchProfile: fetchProfile,
  }

  return <UserProfileContext.Provider value={value}>{children}</UserProfileContext.Provider>
}

export function useUserProfile() {
  const ctx = useContext(UserProfileContext)
  if (!ctx) throw new Error('useUserProfile must be used within UserProfileProvider')
  return ctx
}
