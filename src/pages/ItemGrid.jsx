import { useState, useEffect } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useCompany } from '../hooks/useCompany'
import styles from './ItemGrid.module.css'

// ── Request Confirm Modal ─────────────────────────────────
function RequestModal({ item, onConfirm, onCancel }) {
  const [qty, setQty] = useState(1)

  function dec() { setQty(q => Math.max(1, q - 1)) }
  function inc() { setQty(q => Math.min(99, q + 1)) }

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className={styles.modal}>

        <img src={item.image_url} alt={item.name} className={styles.modalImg} />

        <div className={styles.modalBody}>
          <span className={styles.modalCat}>{item.category}</span>
          <h2 className={styles.modalName}>{item.name}</h2>

          {/* Quantity stepper */}
          <div className={styles.stepperRow}>
            <span className={styles.stepperLabel}>Quantity</span>
            <div className={styles.stepper}>
              <button
                type="button"
                className={styles.stepBtn}
                onClick={dec}
                disabled={qty <= 1}
                aria-label="Decrease quantity"
              >−</button>
              <span className={styles.stepCount}>{qty}</span>
              <button
                type="button"
                className={styles.stepBtn}
                onClick={inc}
                disabled={qty >= 99}
                aria-label="Increase quantity"
              >+</button>
            </div>
          </div>

          {/* Actions */}
          <div className={styles.modalBtns}>
            <button className={styles.btnCancel} onClick={onCancel}>Cancel</button>
            <button className={styles.btnSubmit} onClick={() => onConfirm(qty)}>
              Submit Request
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}

// ── Main ItemGrid ─────────────────────────────────────────
export default function ItemGrid() {
  const { companySlug } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  const plant      = searchParams.get('plant')      || 'N/A'
  const department = searchParams.get('department') || 'N/A'
  const zone       = searchParams.get('zone')       || 'N/A'
  const line       = searchParams.get('line')       || 'N/A'

  const { company, loading: companyLoading, error: companyError } = useCompany(companySlug)

  const [items, setItems]               = useState([])
  const [itemsLoading, setItemsLoading] = useState(true)
  const [pendingItem, setPendingItem]   = useState(null)   // item waiting for confirm
  const [submitting, setSubmitting]     = useState(null)   // item.id being submitted
  const [toast, setToast]               = useState(null)

  useEffect(() => {
    if (!company) return
    supabase
      .from('inventory_items')
      .select('id, name, image_url, category')
      .eq('company_id', company.id)
      .eq('is_active', true)
      .order('category').order('name')
      .then(({ data, error }) => {
        if (!error) setItems(data ?? [])
        setItemsLoading(false)
      })
  }, [company])

  async function handleConfirm(item, quantity) {
    setPendingItem(null)
    setSubmitting(item.id)

    const { error } = await supabase.from('supply_requests').insert({
      company_id: company.id,
      plant, department, zone, line,
      item_name: item.name,
      image_url: item.image_url,
      quantity,
    })

    setSubmitting(null)
    setToast(error
      ? { message: 'Error submitting request.', ok: false }
      : { message: `"${item.name}" × ${quantity} requested!`, ok: true }
    )
    setTimeout(() => setToast(null), 2500)
  }

  if (companyLoading || itemsLoading) return <div className={styles.center}>Loading…</div>
  if (companyError) return <div className={styles.center}>{companyError}</div>

  const locationLabel = [plant, department, zone, line]
    .filter(v => v !== 'N/A').join(' › ') || 'No location set'

  return (
    <div className={styles.page}>

      {/* Sticky top bar */}
      <header className={styles.topBar}>
        <div className={styles.topBarLeft}>
          <button
            className={styles.backBtn}
            onClick={() => navigate(`/req/${companySlug}`)}
            aria-label="Change location"
          >‹</button>
          <button
            className={styles.topBarBrand}
            onClick={() => navigate(`/${companySlug}`)}
            title="Home"
          >
            {company?.logo_url && (
              <img
                src={company.logo_url}
                alt={`${company.name} logo`}
                className={styles.topBarLogo}
              />
            )}
            <div>
              <p className={styles.topBarCompany}>{company?.name || 'AutoRise'}</p>
              <p className={styles.topBarTitle}>Supply Request</p>
            </div>
          </button>
        </div>
        <div className={styles.locationInfo}>
          <span className={styles.locationLabel}>{locationLabel}</span>
          <span className={styles.tapHint}>
            {items.length > 0 ? 'Tap an item to request it' : 'No items configured yet'}
          </span>
        </div>
      </header>

      {/* Item grid */}
      {items.length === 0 ? (
        <div className={styles.center} style={{ flex: 1 }}>
          No inventory items have been added yet.<br />
          Ask your supervisor to add items in the dashboard.
        </div>
      ) : (
        <main className={styles.grid}>
          {items.map(item => {
            const isSubmitting = submitting === item.id
            return (
              <button
                key={item.id}
                className={styles.card}
                onClick={() => setPendingItem(item)}
                disabled={submitting !== null}
                aria-label={`Request ${item.name}`}
              >
                <div className={styles.cardImgWrap}>
                  {isSubmitting
                    ? <span className={styles.spinner} />
                    : <img src={item.image_url} alt={item.name} className={styles.cardImg} loading="lazy" />
                  }
                </div>
                <span className={styles.itemName}>{item.name}</span>
              </button>
            )
          })}
        </main>
      )}

      {/* Confirm modal */}
      {pendingItem && (
        <RequestModal
          item={pendingItem}
          onConfirm={qty => handleConfirm(pendingItem, qty)}
          onCancel={() => setPendingItem(null)}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className={`${styles.toast} ${toast.ok ? styles.toastOk : styles.toastErr}`}>
          {toast.ok ? '✓ ' : '✕ '}{toast.message}
        </div>
      )}

    </div>
  )
}
