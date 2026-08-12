import { useNavigate, useParams } from 'react-router-dom'
import { useCompany } from '../hooks/useCompany'
import styles from './Home.module.css'

export default function Home() {
  const { companySlug } = useParams()
  const { company, loading } = useCompany(companySlug)
  const navigate = useNavigate()

  if (loading) return <div className={styles.page} />

  return (
    <div className={styles.page}>
      <div className={styles.inner}>

        {/* Brand */}
        <div className={styles.brandWrap}>
          {company?.logo_url && (
            <img
              src={company.logo_url}
              alt={`${company.name} logo`}
              className={styles.companyLogo}
            />
          )}
          <p className={styles.brandName}>{company?.name ?? companySlug}</p>
          <h1 className={styles.headline}>Supply Request<br />Tracking System</h1>
          <p className={styles.tagline}>Request supplies from anywhere on the floor — fast, tracked, fulfilled.</p>
        </div>

        {/* Two cards */}
        <div className={styles.cards}>

          <button
            className={`${styles.card} ${styles.cardRequest}`}
            onClick={() => navigate(`/req/${companySlug}`)}
          >
            <span className={styles.cardIcon}>📋</span>
            <span className={styles.cardTitle}>Submit a Request</span>
            <span className={styles.cardDesc}>
              Employees — tap to select your location and request supplies.
            </span>
            <span className={styles.cardCta}>Get Started →</span>
          </button>

          <button
            className={`${styles.card} ${styles.cardDashboard}`}
            onClick={() => navigate(`/admin/${companySlug}`)}
          >
            <span className={styles.cardIcon}>📊</span>
            <span className={styles.cardTitle}>Manager Dashboard</span>
            <span className={styles.cardDesc}>
              Managers — log in to view, action, and track supply requests.
            </span>
            <span className={styles.cardCta}>Log In →</span>
          </button>

        </div>

        {/* Register link */}
        <p className={styles.registerHint}>
          New manager?{' '}
          <button className={styles.registerLink} onClick={() => navigate(`/register/${companySlug}`)}>
            Create an account
          </button>
        </p>

      </div>
    </div>
  )
}
