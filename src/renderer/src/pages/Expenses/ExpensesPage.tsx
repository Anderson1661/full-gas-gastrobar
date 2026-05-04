import React, { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { expensesApi } from '../../lib/api'
import { useAuthStore } from '../../store/auth.store'
import { useAppStore }  from '../../store/app.store'
import { formatCurrency, formatDate, today, nDaysAgo } from '../../lib/utils'
import { Plus } from 'lucide-react'
import RefreshButton from '../../components/shared/RefreshButton'

export default function ExpensesPage(): JSX.Element {
  const { user } = useAuthStore()
  const { notify, cashSessionId } = useAppStore()
  const qc = useQueryClient()

  const [from, setFrom]         = useState(nDaysAgo(30))
  const [to,   setTo]           = useState(today())
  const [showForm, setShowForm] = useState(false)

  const { data: categories = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ['expense-categories'],
    queryFn:  () => expensesApi.categories() as Promise<{ id: number; name: string }[]>
  })

  const { data: expenses = [] } = useQuery<unknown[]>({
    queryKey: ['expenses', from, to],
    queryFn:  () => expensesApi.list({ from, to }) as Promise<unknown[]>
  })

  const total = (expenses as { amount?: number }[]).reduce((s, e) => s + Number(e.amount ?? 0), 0)

  async function createExpense(form: { categoryId: number; description: string; amount: number; notes: string }): Promise<void> {
    if (!user) return
    const result = await expensesApi.create(
      { ...form, registeredBy: user.id, expenseDate: today(), cashSessionId: cashSessionId ?? undefined },
      user.username
    ) as { success: boolean; error?: string }

    if (result.success) {
      notify('success', 'Gasto registrado')
      qc.invalidateQueries({ queryKey: ['expenses'] })
      setShowForm(false)
    } else {
      notify('error', result.error ?? 'Error')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Gastos operativos</h1>
        <div className="flex items-center gap-2">
          <RefreshButton queryKeys={[['expenses'], ['expense-categories']]} />
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium">
            <Plus size={16} /> Registrar gasto
          </button>
        </div>
      </div>

      <div className="flex gap-3 items-center">
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">Desde</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-secondary border border-border text-sm text-foreground focus:outline-none" />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">Hasta</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-secondary border border-border text-sm text-foreground focus:outline-none" />
        </div>
        <div className="ml-auto bg-card border border-border rounded-lg px-4 py-2">
          <p className="text-xs text-muted-foreground">Total gastos</p>
          <p className="text-lg font-bold text-foreground">{formatCurrency(total)}</p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-3 text-left text-muted-foreground font-medium">Fecha</th>
              <th className="px-4 py-3 text-left text-muted-foreground font-medium">Descripción</th>
              <th className="px-4 py-3 text-left text-muted-foreground font-medium">Categoría</th>
              <th className="px-4 py-3 text-right text-muted-foreground font-medium">Monto</th>
              <th className="px-4 py-3 text-left text-muted-foreground font-medium">Registrado por</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {(expenses as { id: number; expense_date: string; description: string; category_name: string; amount: number; registered_by_name: string }[]).map(e => (
              <tr key={e.id} className="hover:bg-secondary/40">
                <td className="px-4 py-3 text-muted-foreground">{formatDate(e.expense_date)}</td>
                <td className="px-4 py-3 text-foreground">{e.description}</td>
                <td className="px-4 py-3 text-muted-foreground">{e.category_name}</td>
                <td className="px-4 py-3 text-right font-semibold text-foreground">{formatCurrency(e.amount)}</td>
                <td className="px-4 py-3 text-muted-foreground">{e.registered_by_name}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {expenses.length === 0 && (
          <div className="text-center py-12 text-muted-foreground text-sm">No hay gastos en el período seleccionado</div>
        )}
      </div>

      {showForm && (
        <ExpenseForm
          categories={categories}
          onClose={() => setShowForm(false)}
          onSubmit={createExpense}
        />
      )}
    </div>
  )
}

function ExpenseForm({ categories, onClose, onSubmit }: {
  categories: { id: number; name: string }[]
  onClose: () => void
  onSubmit: (form: { categoryId: number; description: string; amount: number; notes: string }) => Promise<void>
}): JSX.Element {
  const [form, setForm] = useState({ categoryId: categories[0]?.id ?? 0, description: '', amount: 0, notes: '' })
  const [saving, setSaving] = useState(false)

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-card border border-border rounded-xl w-full max-w-md p-6 space-y-4">
        <h3 className="font-semibold text-foreground">Registrar gasto</h3>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Categoría</label>
          <select value={form.categoryId} onChange={e => setForm({...form, categoryId: Number(e.target.value)})}
            className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm text-foreground focus:outline-none">
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Descripción *</label>
          <input value={form.description} onChange={e => setForm({...form, description: e.target.value})}
            className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Monto *</label>
          <input type="number" value={form.amount} onChange={e => setForm({...form, amount: Number(e.target.value)})}
            className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Notas</label>
          <textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} rows={2}
            className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary" />
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg border border-border text-sm text-muted-foreground">Cancelar</button>
          <button onClick={async () => { setSaving(true); await onSubmit(form); setSaving(false) }}
            disabled={saving || !form.description || !form.amount}
            className="flex-1 py-2 rounded-lg bg-primary text-white text-sm font-medium disabled:opacity-40">
            {saving ? 'Guardando...' : 'Registrar'}
          </button>
        </div>
      </div>
    </div>
  )
}
