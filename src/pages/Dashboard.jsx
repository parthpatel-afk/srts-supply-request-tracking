import { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ClipboardList, Gauge, Clock, CheckCircle2, AlertCircle,
  Upload, Trash2, Package, X, Plus, LogOut, ChevronDown,
  List, BarChart2, Download, Search, TrendingUp, TrendingDown, Minus, ArrowUpDown,
  SlidersHorizontal, ChevronUp, Camera, FileText, Table2,
} from 'lucide-react'
import { getSession, saveSession, clearSession } from '../hooks/useAuth'
import {
  ResponsiveContainer, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell,
  PieChart, Pie,
} from 'recharts'
import { supabase } from '../lib/supabase'
import { useCompany } from '../hooks/useCompany'
import styles from './Dashboard.module.css'

// ── Constants ─────────────────────────────────────────────
const STATUS_META = {
  Pending:   { label: 'Pending',   color: 'var(--status-pending)',   Icon: Clock },
  Ordered:   { label: 'Ordered',   color: 'var(--status-ordered)',   Icon: ClipboardList },
  Fulfilled: { label: 'Fulfilled', color: 'var(--status-fulfilled)', Icon: CheckCircle2 },
  Denied:    { label: 'Denied',    color: 'var(--status-denied)',    Icon: AlertCircle },
}
const NEXT_ACTIONS = {
  Pending:   ['Ordered', 'Denied'],
  Ordered:   ['Fulfilled', 'Pending'],
  Fulfilled: ['Ordered', 'Pending'],
  Denied:    ['Pending'],
}
const CATEGORIES = ['PPE', 'Power Tools', 'Hand Tools', 'Measuring', 'Chemicals', 'Hardware', 'Safety Equipment', 'Consumables', 'General']

// ── Helpers ────────────────────────────────────────────────
function timeAgo(iso) {
  const diff = Math.floor((Date.now() - new Date(iso)) / 1000)
  if (diff < 60)    return `${diff}s ago`
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}
function locationStr(req) {
  return [req.plant, req.department, req.zone, req.line]
    .filter(v => v && v !== 'N/A').join(' › ') || '—'
}
function buildChartData(allReqs, mineReqs, trendMode = 'daily') {
  // Bar chart — top items
  const allMap = {}, mineMap = {}
  allReqs.forEach(r => { allMap[r.item_name] = (allMap[r.item_name] || 0) + 1 })
  mineReqs.forEach(r => { mineMap[r.item_name] = (mineMap[r.item_name] || 0) + 1 })
  const topItems = Object.entries(allMap)
    .map(([name, total]) => ({ name, total, mine: mineMap[name] || 0, other: total - (mineMap[name] || 0) }))
    .sort((a, b) => b.total - a.total).slice(0, 8)

  // By area (plant + dept)
  const areaMap = {}
  allReqs.forEach(r => {
    const parts = [r.plant, r.department].filter(v => v && v !== 'N/A')
    const key = parts.join(' › ') || 'Unknown'
    areaMap[key] = (areaMap[key] || 0) + 1
  })
  const byArea = Object.entries(areaMap)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count).slice(0, 8)

  // By status
  const statusMap = { Pending: 0, Ordered: 0, Fulfilled: 0, Denied: 0 }
  allReqs.forEach(r => { if (statusMap[r.status] !== undefined) statusMap[r.status]++ })
  const STATUS_COLORS_PIE = { Pending: '#F59E0B', Ordered: '#3B82F6', Fulfilled: '#10B981', Denied: '#EF4444' }
  const byStatus = Object.entries(statusMap)
    .map(([name, count]) => ({ name, count, fill: STATUS_COLORS_PIE[name] }))
    .filter(d => d.count > 0)

  // Volume trend — daily (14) / weekly (6) / monthly (6)
  let volumeData
  if (trendMode === 'weekly') {
    volumeData = Array.from({ length: 6 }, (_, i) => {
      const end = new Date(); end.setDate(end.getDate() - i * 7)
      const start = new Date(end); start.setDate(start.getDate() - 6)
      const et = end.getTime(), st = start.getTime()
      return {
        date: start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        all:  allReqs.filter(r => { const t = new Date(r.created_at).getTime(); return t >= st && t <= et }).length,
        mine: mineReqs.filter(r => { const t = new Date(r.created_at).getTime(); return t >= st && t <= et }).length,
      }
    }).reverse()
  } else if (trendMode === 'monthly') {
    volumeData = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i)
      const yr = d.getFullYear(), mo = d.getMonth()
      return {
        date:  d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        all:   allReqs.filter(r => { const rd = new Date(r.created_at); return rd.getFullYear() === yr && rd.getMonth() === mo }).length,
        mine:  mineReqs.filter(r => { const rd = new Date(r.created_at); return rd.getFullYear() === yr && rd.getMonth() === mo }).length,
      }
    }).reverse()
  } else {
    // daily — 14 days
    const allDay = {}, mineDay = {}
    allReqs.forEach(r => { const d = r.created_at.split('T')[0]; allDay[d] = (allDay[d] || 0) + 1 })
    mineReqs.forEach(r => { const d = r.created_at.split('T')[0]; mineDay[d] = (mineDay[d] || 0) + 1 })
    volumeData = Array.from({ length: 14 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (13 - i))
      const key = d.toISOString().split('T')[0]
      return { date: key.slice(5).replace('-', '/'), all: allDay[key] || 0, mine: mineDay[key] || 0 }
    })
  }

  return { topItems, volumeData, byArea, byStatus }
}
const tooltipStyle = {
  contentStyle: { background: '#fff', border: '1px solid rgba(15,31,61,0.12)', borderRadius: 8, fontSize: 13 },
  labelStyle: { color: '#0F1F3D', fontWeight: 700 },
}

function buildSummaryRows(visibleReqs, allReqs) {
  const map = {}
  const now  = Date.now()
  const week = 7 * 86400000
  visibleReqs.forEach(r => {
    if (!map[r.item_name]) {
      map[r.item_name] = {
        item_name: r.item_name,
        image_url: r.image_url,
        totalQty: 0, count: 0,
        statuses: { Pending: 0, Ordered: 0, Fulfilled: 0, Denied: 0 },
        lastRequested: r.created_at,
      }
    }
    const row = map[r.item_name]
    row.totalQty += (r.quantity ?? 1)
    row.count++
    if (row.statuses[r.status] !== undefined) row.statuses[r.status]++
    if (r.created_at > row.lastRequested) row.lastRequested = r.created_at
  })
  Object.keys(map).forEach(name => {
    const last7 = allReqs.filter(r => r.item_name === name && (now - new Date(r.created_at).getTime()) < week).length
    const prev7 = allReqs.filter(r => r.item_name === name && (now - new Date(r.created_at).getTime()) >= week && (now - new Date(r.created_at).getTime()) < 2 * week).length
    map[name].trend = last7 > prev7 ? 'up' : last7 < prev7 ? 'down' : 'same'
  })
  return Object.values(map)
}

function exportCSV(rows, view) {
  let csv
  if (view === 'summary') {
    const headers = ['Item', 'Total Qty', 'Requests', 'Pending', 'Ordered', 'Fulfilled', 'Denied', 'Last Requested', 'Trend']
    const data = rows.map(r => [
      `"${r.item_name.replace(/"/g, '""')}"`,
      r.totalQty, r.count,
      r.statuses.Pending, r.statuses.Ordered, r.statuses.Fulfilled, r.statuses.Denied,
      `"${new Date(r.lastRequested).toLocaleString()}"`, r.trend,
    ].join(','))
    csv = [headers.join(','), ...data].join('\n')
  } else {
    const headers = ['Time', 'Item', 'Location', 'Qty', 'Status']
    const data = rows.map(r => [
      `"${new Date(r.created_at).toLocaleString()}"`,
      `"${r.item_name.replace(/"/g, '""')}"`,
      `"${locationStr(r)}"`,
      r.quantity ?? 1, r.status,
    ].join(','))
    csv = [headers.join(','), ...data].join('\n')
  }
  const blob = new Blob([csv], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url
  a.download = `supply-requests-${view}-${new Date().toISOString().split('T')[0]}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function exportPDF({ rows, view, summaryRows, company, areaLabel, timeRange, statusFilter, searchFilter }) {
  const doc      = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W        = doc.internal.pageSize.getWidth()
  const H        = doc.internal.pageSize.getHeight()
  
  // ── Color System ──
  const BRAND = {
    NAVY:     [15, 31, 61],   // #0F1F3D
    NAVY_LT:  [21, 39, 69],
    GREEN:    [27, 110, 60],  // #1B6E3C
    ORANGE:   [245, 158, 11], // #F59E0B (Pending)
    BLUE:     [59, 130, 246], // #3B82F6 (Ordered)
    EST_GREEN:[16, 185, 129], // #10B981 (Fulfilled)
    RED:      [239, 68, 68],  // #EF4444 (Denied)
    MUTED:    [107, 114, 128],
    LIGHT:    [249, 250, 251],
    BORDER:   [229, 231, 235],
    WHITE:    [255, 255, 255]
  }

  const CHART_PALETTE = [
    [16, 185, 129], // Green
    [59, 130, 246], // Blue
    [245, 158, 11], // Amber
    [139, 92, 246], // Violet
    [239, 68, 68],  // Red
    [6, 182, 212],  // Cyan
    [99, 102, 241], // Indigo
  ]

  const now      = new Date()
  const dateStr  = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const timeStr  = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })

  // ── Helper: draw a filled rounded rect ──
  function fillRect(x, y, w, h, r, color) {
    doc.setFillColor(...color)
    doc.roundedRect(x, y, w, h, r, r, 'F')
  }
  function drawBorder(x, y, w, h, r, color, thick = 0.5) {
    doc.setDrawColor(...color)
    doc.setLineWidth(thick)
    doc.roundedRect(x, y, w, h, r, r, 'D')
  }

  // ── Consistency: Item to Color Mapping ──
  // We use a professional red heatmap gradient: Intense Red for top value, fading out.
  const HEATMAP = [
    [192, 75, 21],   // Level 1: Deep Burnt Orange/Red (AutoRise Accent)
    [210, 100, 50],  // Level 2
    [225, 130, 90],  // Level 3
    [240, 160, 130], // Level 4
    [250, 190, 170], // Level 5 (Lightest)
  ]

  const colorMap = {}
  const itemsWithCounts = []
  
  const topCountSrc = view === 'summary' ? [...summaryRows].sort((a, b) => b.count - a.count).slice(0, 5)
                                         : (() => {
                                             const map = {}
                                             rows.forEach(r => { map[r.item_name] = (map[r.item_name] || 0) + 1 })
                                             return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5)
                                               .map(([item_name, count]) => ({ item_name, count }))
                                           })()

  const topQtySrc = view === 'summary' ? [...summaryRows].sort((a, b) => b.totalQty - a.totalQty).slice(0, 5)
                                       : (() => {
                                           const map = {}
                                           rows.forEach(r => { map[r.item_name] = (map[r.item_name] || 0) + (r.quantity ?? 1) })
                                           return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5)
                                             .map(([item_name, count]) => ({ item_name, totalQty: count }))
                                         })()

  // Assign colors based on rank in the frequency chart first, then volume
  topCountSrc.forEach((it, idx) => { if(!colorMap[it.item_name]) colorMap[it.item_name] = HEATMAP[idx] })
  topQtySrc.forEach((it, idx) => { if(!colorMap[it.item_name]) colorMap[it.item_name] = HEATMAP[idx] })
  // Fallback for anyone missing
  summaryRows.forEach(it => { if(!colorMap[it.item_name]) colorMap[it.item_name] = HEATMAP[4] })

  // ── Page 1: Cover / Summary ──────────────────────────────

  // Header: Sleek & Light
  fillRect(0, 0, W, 4, 0, BRAND.NAVY) // Top accent line
  doc.setTextColor(...BRAND.NAVY)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(22)
  doc.text('SUPPLY REQUEST REPORT', 14, 20)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text(company?.name?.toUpperCase() ?? 'COMPANY', 14, 27)
  doc.setTextColor(...BRAND.GREEN)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text('LEAN OPERATIONS · AUTHORIZE AUTORISE', 14, 33)
  doc.setTextColor(...BRAND.MUTED)
  doc.setFont('helvetica', 'normal')
  doc.text(`Doc ID: SRTS-${now.getTime().toString().slice(-6)} · Generated ${dateStr} at ${timeStr}`, 14, 38)

  // Filter band
  fillRect(14, 45, W - 28, 10, 1, BRAND.LIGHT)
  doc.setDrawColor(...BRAND.BORDER)
  doc.setLineWidth(0.1)
  doc.roundedRect(14, 45, W - 28, 10, 1, 1, 'D')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(...BRAND.NAVY)
  const filters = [
    `AREA: ${areaLabel.toUpperCase()}`,
    `PERIOD: ${timeRange === 'all' ? 'ALL TIME' : timeRange === '7D' ? 'LAST 7 DAYS' : 'LAST 30 DAYS'}`,
    `STATUS: ${statusFilter.toUpperCase()}`,
    ...(searchFilter ? [`SEARCH: "${searchFilter.toUpperCase()}"`] : []),
    `VIEW: ${view.toUpperCase()}`,
  ]
  doc.text(filters.join('   |   '), W/2, 51.5, { align: 'center' })

  // ── Stats row ──
  const statData = (() => {
    const src = view === 'summary' ? summaryRows : rows
    if (view === 'summary') {
      const totalItems = src.length
      const totalQty   = src.reduce((s, r) => s + r.totalQty, 0)
      const totalReqs  = src.reduce((s, r) => s + r.count, 0)
      const pending    = src.reduce((s, r) => s + (r.statuses?.Pending  ?? 0), 0)
      const fulfilled  = src.reduce((s, r) => s + (r.statuses?.Fulfilled ?? 0), 0)
      return [
        { label: 'CATALOG ITEMS', value: totalItems, color: BRAND.NAVY },
        { label: 'TOTAL UNITS', value: totalQty, color: BRAND.GREEN },
        { label: 'REQUEST COUNT', value: totalReqs, color: BRAND.NAVY_LT },
        { label: 'PENDING REQS', value: pending, color: BRAND.ORANGE },
        { label: 'FULFILLED', value: fulfilled, color: BRAND.EST_GREEN },
      ]
    } else {
      const counts = { Pending: 0, Ordered: 0, Fulfilled: 0, Denied: 0 }
      src.forEach(r => { if (counts[r.status] !== undefined) counts[r.status]++ })
      return [
        { label: 'TOTAL ENTRIES', value: src.length, color: BRAND.NAVY },
        { label: 'PENDING', value: counts.Pending, color: BRAND.ORANGE },
        { label: 'ORDERED', value: counts.Ordered, color: BRAND.BLUE },
        { label: 'FULFILLED', value: counts.Fulfilled, color: BRAND.EST_GREEN },
        { label: 'DENIED', value: counts.Denied, color: BRAND.RED },
      ]
    }
  })()

  const statBoxW = (W - 28 - (statData.length - 1) * 4) / statData.length
  statData.forEach((s, i) => {
    const bx = 14 + i * (statBoxW + 4)
    const by = 64
    // Card Body
    fillRect(bx, by, statBoxW, 24, 2, BRAND.WHITE)
    drawBorder(bx, by, statBoxW, 24, 2, BRAND.BORDER, 0.2)
    // Top Accent Border (match Dashboard)
    fillRect(bx, by, statBoxW, 3, 0.5, s.color)
    
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.setTextColor(...BRAND.NAVY)
    doc.text(String(s.value), bx + statBoxW / 2, by + 14, { align: 'center' })
    doc.setFontSize(6.5)
    doc.setTextColor(...BRAND.MUTED)
    doc.text(s.label, bx + statBoxW / 2, by + 19, { align: 'center' })
  })

  // ── Top Lists Header ──
  let y = 100
  doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(...BRAND.NAVY)
  doc.text('ANALYTIC SNAPSHOT', 14, y)
  doc.setDrawColor(...BRAND.BORDER)
  doc.setLineWidth(0.3)
  doc.line(14, y + 2, W - 14, y + 2)
  y += 12

  // Render Top Requested
  doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...BRAND.NAVY)
  doc.text('TOP REQUESTED ITEMS (BY FREQUENCY)', 14, y)
  y += 6

  const maxCount = topCountSrc[0]?.count ?? 1
  const barAreaW = W - 28 - 65

  topCountSrc.forEach((item, idx) => {
    const label = item.item_name
    const val   = item.count
    const barW  = Math.max(8, (val / maxCount) * barAreaW)
    const rowY  = y + idx * 8
    const itemColor = colorMap[label] ?? CHART_PALETTE[0]

    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...BRAND.NAVY)
    doc.text(`${idx + 1}. ${label.slice(0, 35)}`, 14, rowY + 4)
    
    // Bar with item-specific color mapping
    fillRect(14 + 60, rowY + 1.5, barW, 3.5, 0.5, itemColor)
    
    doc.setFont('helvetica', 'bold').setFontSize(7).setTextColor(...itemColor)
    doc.text(`${val} REQS`, 14 + 60 + barW + 3, rowY + 4.2)
  })

  y += 48

  // Render Top Volume
  doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...BRAND.NAVY)
  doc.text('TOP ITEMS BY VOLUME (TOTAL UNITS)', 14, y)
  y += 6

  const maxQty = topQtySrc[0]?.totalQty ?? 1
  topQtySrc.forEach((item, idx) => {
    const label = item.item_name
    const val   = item.totalQty
    const barW  = Math.max(8, (val / maxQty) * barAreaW)
    const rowY  = y + idx * 8
    const itemColor = colorMap[label] ?? CHART_PALETTE[0]

    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...BRAND.NAVY)
    doc.text(`${idx + 1}. ${label.slice(0, 35)}`, 14, rowY + 4)
    
    // Consistent colored bars
    fillRect(14 + 60, rowY + 1.5, barW, 3.5, 0.5, itemColor)
    
    doc.setFont('helvetica', 'bold').setFontSize(7).setTextColor(...itemColor)
    doc.text(`${val} UNITS`, 14 + 60 + barW + 3, rowY + 4.2)
  })

  // ── Insights ──
  y += 54
  fillRect(14, y, W - 28, 28, 1, BRAND.LIGHT)
  drawBorder(14, y, W - 28, 28, 1, BRAND.BORDER, 0.2)
  
  doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(...BRAND.NAVY)
  doc.text('OPERATIONAL INSIGHTS', 19, y + 8)
  
  const insightLines = (() => {
    const src = view === 'summary' ? summaryRows : rows
    const lines = []
    const totalReqs = view === 'summary' ? src.reduce((s, r) => s + r.count, 0) : src.length
    const totalUnits = view === 'summary' ? src.reduce((s, r) => s + r.totalQty, 0) : src.reduce((s, r) => s + (r.quantity ?? 1), 0)
    lines.push(`• Processed ${totalUnits} units across ${totalReqs} validated site requests.`)
    
    if (view === 'summary') {
      const topFreq = [...src].sort((a, b) => b.count - a.count)[0]
      const topVol = [...src].sort((a, b) => b.totalQty - a.totalQty)[0]
      if (topFreq) lines.push(`• Frequency Bottleneck: "${topFreq.item_name}" requires the most frequent replenishment.`)
      if (topVol) lines.push(`• Inventory Impact: "${topVol.item_name}" moved the highest total volume (${topVol.totalQty} Units).`)
    } else {
      const fulfillRate = Math.round((src.filter(r => r.status === 'Fulfilled').length / totalReqs) * 100) || 0
      lines.push(`• KPI Update: Current fulfillment efficiency is trending at ${fulfillRate}%.`)
    }
    return lines
  })()

  doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(70, 80, 100)
  insightLines.forEach((line, i) => { doc.text(line, 19, y + 15 + i * 5) })

  // Footer on Page 1
  doc.setFontSize(7).setTextColor(...BRAND.MUTED)
  doc.text(`${company?.name ?? 'AUTORISE'} · ${areaLabel} · PROPRIETARY REPORT`, 14, H - 10)
  doc.text('PAGE 1 OF 2', W - 14, H - 10, { align: 'right' })

  // ── Page 2: Detailed Data ──────────────────────────────────
  doc.addPage()
  fillRect(0, 0, W, 18, 0, BRAND.NAVY)
  doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(255, 255, 255)
  doc.text(view === 'summary' ? 'INVENTORY MOVEMENT SUMMARY' : 'DETAILED REQUEST LOG', 14, 11.5)

  if (view === 'summary') {
    autoTable(doc, {
      startY: 24,
      head: [['ITEM NAME', 'UNITS', 'REQS', 'PEND', 'ORD', 'FULL', 'DEN', 'TREND']],
      body: summaryRows.map(r => [
        r.item_name,
        r.totalQty,
        r.count,
        r.statuses?.Pending  ?? 0,
        r.statuses?.Ordered  ?? 0,
        r.statuses?.Fulfilled ?? 0,
        r.statuses?.Denied   ?? 0,
        r.trend === 'up' ? '↑ UP' : r.trend === 'down' ? '↓ DOWN' : '— FLAT',
      ]),
      styles: { font: 'helvetica', fontSize: 7, cellPadding: 2, textColor: BRAND.NAVY },
      headStyles: { fillColor: BRAND.NAVY, textColor: [255,255,255], fontStyle: 'bold', fontSize: 7 },
      alternateRowStyles: { fillColor: BRAND.LIGHT },
      columnStyles: { 0: { cellWidth: 60 }, 1: { fontStyle: 'bold', textColor: BRAND.GREEN } },
      margin: { left: 14, right: 14 },
      didDrawPage: (data) => {
        doc.setFontSize(7).setTextColor(...BRAND.MUTED)
        doc.text(`${company?.name ?? 'AUTORISE'} · DATA EXPORT · ${dateStr}`, 14, H - 10)
        doc.text(`PAGE ${data.pageNumber + 1}`, W - 14, H - 10, { align: 'right' })
      },
    })
  } else {
    autoTable(doc, {
      startY: 24,
      head: [['TIMESTAMP', 'ITEM', 'LOCATION', 'QTY', 'STATUS']],
      body: rows.map(r => [
        new Date(r.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
        r.item_name,
        locationStr(r),
        r.quantity ?? 1,
        r.status.toUpperCase(),
      ]),
      styles: { font: 'helvetica', fontSize: 7, cellPadding: 2, textColor: BRAND.NAVY },
      headStyles: { fillColor: BRAND.NAVY, textColor: [255,255,255], fontStyle: 'bold', fontSize: 7 },
      alternateRowStyles: { fillColor: BRAND.LIGHT },
      columnStyles: { 0: { cellWidth: 35 }, 1: { cellWidth: 50 }, 3: { fontStyle: 'bold', textColor: BRAND.GREEN } },
      margin: { left: 14, right: 14 },
      didDrawPage: (data) => {
        doc.setFontSize(7).setTextColor(...BRAND.MUTED)
        doc.text(`${company?.name ?? 'AUTORISE'} · DATA EXPORT · ${dateStr}`, 14, H - 10)
        doc.text(`PAGE ${data.pageNumber + 1}`, W - 14, H - 10, { align: 'right' })
      },
    })
  }

  doc.save(`supply-report-${view}-${now.toISOString().split('T')[0]}.pdf`)
}

// ── Mobile request card ───────────────────────────────────
function MobileCard({ req, onAction, highlight }) {
  const meta    = STATUS_META[req.status] ?? STATUS_META.Pending
  const actions = NEXT_ACTIONS[req.status] ?? []
  return (
    <div className={`${styles.mobileCard} ${highlight ? styles.mobileCardMine : ''}`}>
      <div className={styles.mobileCardInner}>
        {req.image_url && (
          <img src={req.image_url} alt={req.item_name} className={styles.mobileThumb} />
        )}
        <div className={styles.mobileCardContent}>
          <div className={styles.mobileCardTop}>
            <span className={styles.mobileItemName}>{req.item_name}</span>
            <span className={styles.statusBadge} style={{ '--s-color': meta.color }}>{meta.label}</span>
          </div>
          <div className={styles.mobileLocation}>{locationStr(req)}</div>
          {req.quantity > 1 && (
            <div className={styles.mobileQty}>Qty: <strong>{req.quantity}</strong></div>
          )}
          <div className={styles.mobileCardBottom}>
            <span className={styles.mobileTime}>{timeAgo(req.created_at)}</span>
            {actions.length > 0 && (
              <div className={styles.actionsCell}>
                {actions.map(action => (
                  <button
                    key={action}
                    className={styles.actionBtn}
                    style={{ '--a-color': STATUS_META[action].color }}
                    onClick={() => onAction(req.id, action)}
                  >
                    {action}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Location options (mirrors LocationContext) ────────────
const LOCATION_DEFAULTS = {
  plant:      ['Plant 1', 'Plant 2', 'Plant 3'],
  department: ['Assembly', 'Machining', 'Packaging', 'Welding', 'Maintenance'],
  zone:       ['Zone A', 'Zone B', 'Zone C', 'Zone D'],
  line:       ['Line 1', 'Line 2', 'Line 3', 'Line 4'],
}
const LOCATION_LABELS = { plant: 'Plant', department: 'Department', zone: 'Zone', line: 'Line' }

function loadCustomLocations(slug) {
  try { return JSON.parse(localStorage.getItem(`srts_${slug}_locations`)) ?? {} } catch { return {} }
}

// ── Login Page ────────────────────────────────────────────
function LoginPage({ company, companySlug, onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [checking, setChecking] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setChecking(true)
    const { data, error: dbErr } = await supabase
      .from('managers')
      .select('*')
      .eq('company_id', company.id)
      .eq('username', username.trim().toLowerCase())
      .eq('password', password)
      .single()
    setChecking(false)
    if (dbErr || !data) { setError('Invalid username or password.'); return }
    saveSession(companySlug, data)
    onLogin(data)
  }

  return (
    <div className={styles.loginPage}>
      <button className={styles.loginBack} onClick={() => navigate(`/${companySlug}`)}>
        ← Back
      </button>

      <div className={styles.loginCard}>
        {company.logo_url && (
          <img src={company.logo_url} alt={`${company.name} logo`} className={styles.loginLogo} />
        )}
        <p className={styles.loginBrand}>{company.name}</p>
        <h1 className={styles.loginTitle}>Manager Login</h1>
        <p className={styles.loginSub}>Enter your credentials to continue.</p>
        <form className={styles.loginForm} onSubmit={handleSubmit}>
          <div className={styles.loginField}>
            <label className={styles.loginLabel}>Username</label>
            <input
              className={styles.loginInput}
              type="text" autoComplete="username" required
              value={username} onChange={e => setUsername(e.target.value)}
              placeholder="e.g. admin"
            />
          </div>
          <div className={styles.loginField}>
            <label className={styles.loginLabel}>Password</label>
            <input
              className={styles.loginInput}
              type="password" autoComplete="current-password" required
              value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          {error && <p className={styles.loginError}>{error}</p>}
          <button className={styles.loginBtn} type="submit" disabled={checking}>
            {checking ? 'Checking…' : 'Enter Dashboard →'}
          </button>
        </form>
        <p className={styles.loginRegisterHint}>
          New manager?{' '}
          <button className={styles.loginRegisterLink} onClick={() => navigate(`/register/${companySlug}`)}>
            Create an account
          </button>
        </p>
      </div>
    </div>
  )
}

// ── Confirm Delete Modal ───────────────────────────────────
function ConfirmDeleteModal({ item, onConfirm, onCancel }) {
  return (
    <div className={styles.modalOverlay} onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className={styles.confirmModal}>
        <div className={styles.confirmIconWrap}>
          <Trash2 size={28} color="var(--status-denied)" />
        </div>
        <h2 className={styles.confirmTitle}>Remove Item?</h2>
        <p className={styles.confirmMsg}>
          <span className={styles.confirmItemName}>{item.name}</span>
          {' '}will be permanently removed from your inventory and cannot be recovered.
        </p>
        <div className={styles.confirmBtns}>
          <button className={styles.btnCancel} onClick={onCancel}>Cancel</button>
          <button className={styles.btnDanger} onClick={onConfirm}>Delete</button>
        </div>
      </div>
    </div>
  )
}

// ── Image compression utility ──────────────────────────────
async function compressImage(file, maxPx = 1024, targetBytes = 500 * 1024) {
  if (file.size <= targetBytes) return file
  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const canvas = document.createElement('canvas')
      let { width, height } = img
      if (width > maxPx || height > maxPx) {
        const scale = Math.min(maxPx / width, maxPx / height)
        width  = Math.round(width  * scale)
        height = Math.round(height * scale)
      }
      canvas.width  = width
      canvas.height = height
      canvas.getContext('2d').drawImage(img, 0, 0, width, height)
      canvas.toBlob(
        blob => resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' })),
        'image/jpeg',
        0.82
      )
    }
    img.src = url
  })
}

// ── Add Item Modal Form ────────────────────────────────────
function AddItemModal({ company, onSuccess, onImageReady, onClose }) {
  const [name, setName]         = useState('')
  const [category, setCategory] = useState('PPE')
  const [file, setFile]         = useState(null)
  const [preview, setPreview]   = useState(null)
  const [status, setStatus]     = useState('idle') // idle | saving | error
  const [errorMsg, setErrorMsg] = useState('')
  const fileInputRef   = useRef(null)
  const cameraInputRef = useRef(null)

  function handleFile(e) {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    setPreview(URL.createObjectURL(f))
  }

  function handleDrop(e) {
    e.preventDefault()
    const f = e.dataTransfer.files?.[0]
    if (!f || !f.type.startsWith('image/')) return
    setFile(f)
    setPreview(URL.createObjectURL(f))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) return
    if (!file) {
      setStatus('error')
      setErrorMsg('Please select or take a photo first.')
      return
    }
    setStatus('saving')
    setErrorMsg('')

    // 1. Compress client-side (skip if already small)
    const compressed = await compressImage(file)

    // 2. Insert row immediately with null image_url
    const { data: inserted, error: insertErr } = await supabase
      .from('inventory_items')
      .insert({ company_id: company.id, name: name.trim(), image_url: null, category })
      .select('id')
      .single()

    if (insertErr) {
      setStatus('error')
      setErrorMsg(insertErr.message)
      return
    }

    // 3. Close modal — user is free while upload continues in background
    onSuccess()

    // 4. Upload compressed image
    const path = `${company.id}/${inserted.id}_${name.trim().replace(/\s+/g, '_')}.jpg`
    const { data: uploadData, error: uploadErr } = await supabase.storage
      .from('inventory_images')
      .upload(path, compressed, { cacheControl: '31536000', upsert: false })
    if (uploadErr) return

    // 5. Get public URL and patch the row
    const { data: { publicUrl } } = supabase.storage
      .from('inventory_images')
      .getPublicUrl(uploadData.path)

    await supabase.from('inventory_items').update({ image_url: publicUrl }).eq('id', inserted.id)
    onImageReady(inserted.id, publicUrl)
  }

  return (
    <div className={styles.modalOverlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>

        {/* Modal header */}
        <div className={styles.modalHead}>
          <span className={styles.modalTitle}>Add Inventory Item</span>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <form className={styles.addForm} onSubmit={handleSubmit}>

          {/* Image upload area */}
          {preview ? (
            <div
              className={`${styles.uploadArea} ${styles.uploadHasPreview}`}
              onClick={() => fileInputRef.current?.click()}
            >
              <img src={preview} alt="Preview" className={styles.uploadPreview} />
            </div>
          ) : (
            <div
              className={styles.uploadArea}
              onDragOver={e => e.preventDefault()}
              onDrop={handleDrop}
            >
              {/* Desktop: click to browse */}
              <div className={styles.uploadDesktop} onClick={() => fileInputRef.current?.click()}>
                <Upload size={30} color="var(--text-muted)" />
                <span className={styles.uploadPrompt}>Click or drag &amp; drop to upload</span>
                <span className={styles.uploadHint}>JPG · PNG · WEBP · max 5 MB</span>
              </div>

              {/* Mobile: camera + gallery buttons */}
              <div className={styles.uploadMobile}>
                <button type="button" className={styles.uploadCameraBtn} onClick={() => cameraInputRef.current?.click()}>
                  <Camera size={22} />
                  Take Photo
                </button>
                <button type="button" className={styles.uploadGalleryBtn} onClick={() => fileInputRef.current?.click()}>
                  <Upload size={18} />
                  Choose File
                </button>
              </div>
            </div>
          )}

          {/* Hidden inputs */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFile}
            className={styles.fileInput}
          />
          <input
            ref={fileInputRef}
            id="itemImg"
            type="file"
            accept="image/*"
            onChange={handleFile}
            className={styles.fileInput}
          />

          {/* Name */}
          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="itemName">Item Name</label>
            <input
              id="itemName"
              type="text"
              className={styles.formInput}
              placeholder="e.g., Milwaukee M18 Cordless Drill"
              value={name}
              onChange={e => setName(e.target.value)}
              required
            />
          </div>

          {/* Category */}
          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="itemCat">Category</label>
            <div className={styles.selectWrap}>
              <select
                id="itemCat"
                className={styles.formSelect}
                value={category}
                onChange={e => setCategory(e.target.value)}
              >
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <span className={styles.selectChevron}>▾</span>
            </div>
          </div>

          {/* Error message */}
          {status === 'error' && (
            <p className={styles.formError}>{errorMsg || 'Upload failed. Please try again.'}</p>
          )}

          {/* Actions */}
          <div className={styles.formBtns}>
            <button type="button" className={styles.btnCancel} onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className={styles.btnSubmit}
              disabled={status === 'saving'}
            >
              {status === 'saving' ? 'Saving…' : 'Add to Inventory'}
            </button>
          </div>

        </form>
      </div>
    </div>
  )
}

// ── Summary Table component ────────────────────────────────
function SummaryTable({ rows, sort, onSort, onDrillDown, styles }) {
  function SortTh({ col, children }) {
    const active = sort.col === col
    return (
      <th
        className={`${styles.sortableTh} ${active ? styles.sortThActive : ''}`}
        onClick={() => onSort(col)}
      >
        <span>{children}</span>
        <ArrowUpDown size={10} className={styles.sortThIcon} />
      </th>
    )
  }
  if (rows.length === 0) {
    return <div className={styles.empty}>No items match the current filters.</div>
  }

  const TrendBadge = ({ trend }) => (
    <span className={
      trend === 'up'   ? styles.trendUp :
      trend === 'down' ? styles.trendDown :
      styles.trendFlat
    }>
      {trend === 'up'   && <><TrendingUp   size={12} /> Up</>}
      {trend === 'down' && <><TrendingDown size={12} /> Down</>}
      {trend === 'same' && <><Minus        size={12} /> Flat</>}
    </span>
  )

  return (
    <>
      {/* Mobile cards */}
      <div className={styles.summaryMobileList}>
        {rows.map(row => (
          <div
            key={row.item_name}
            className={styles.summaryCard}
            onClick={() => onDrillDown(row.item_name)}
          >
            <div className={styles.summaryCardHeader}>
              <div className={styles.itemCell}>
                {row.image_url && (
                  <img src={row.image_url} alt={row.item_name} className={styles.itemThumb} />
                )}
                <span className={styles.summaryCardName}>{row.item_name}</span>
              </div>
              <TrendBadge trend={row.trend} />
            </div>
            <div className={styles.summaryCardStats}>
              <div className={styles.summaryCardStat}>
                <span className={styles.summaryCardStatVal}>{row.totalQty}</span>
                <span className={styles.summaryCardStatLbl}>Total Qty</span>
              </div>
              <div className={styles.summaryCardStat}>
                <span className={styles.summaryCardStatVal}>{row.count}</span>
                <span className={styles.summaryCardStatLbl}>Requests</span>
              </div>
              <div className={styles.summaryCardStat}>
                <span className={styles.summaryCardStatVal}>{timeAgo(row.lastRequested)}</span>
                <span className={styles.summaryCardStatLbl}>Last Request</span>
              </div>
            </div>
            <div className={styles.statusBreakdown}>
              {Object.entries(row.statuses)
                .filter(([, v]) => v > 0)
                .map(([s, v]) => (
                  <span
                    key={s}
                    className={styles.breakdownPill}
                    style={{ '--bp': STATUS_META[s]?.color }}
                  >
                    {v} {s}
                  </span>
                ))}
            </div>
          </div>
        ))}
      </div>

      {/* Desktop table */}
      <div className={styles.summaryTableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <SortTh col="name">Item</SortTh>
              <SortTh col="qty">Total Qty</SortTh>
              <SortTh col="count">Requests</SortTh>
              <th>Breakdown</th>
              <SortTh col="last">Last Request</SortTh>
              <th>7-Day Trend</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr
                key={row.item_name}
                className={styles.summaryRow}
                onClick={() => onDrillDown(row.item_name)}
                title="Click to view individual requests"
              >
                <td className={styles.tdItem}>
                  <div className={styles.itemCell}>
                    {row.image_url && (
                      <img src={row.image_url} alt={row.item_name} className={styles.itemThumb} />
                    )}
                    {row.item_name}
                  </div>
                </td>
                <td className={styles.tdQty}>{row.totalQty}</td>
                <td className={styles.summaryCountTd}>{row.count}</td>
                <td>
                  <div className={styles.statusBreakdown}>
                    {Object.entries(row.statuses)
                      .filter(([, v]) => v > 0)
                      .map(([s, v]) => (
                        <span
                          key={s}
                          className={styles.breakdownPill}
                          style={{ '--bp': STATUS_META[s]?.color }}
                        >
                          {v} {s}
                        </span>
                      ))}
                  </div>
                </td>
                <td className={styles.tdTime}>{timeAgo(row.lastRequested)}</td>
                <td><TrendBadge trend={row.trend} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

// ── Main Dashboard component ───────────────────────────────
export default function Dashboard() {
  const { companySlug } = useParams()
  const navigate = useNavigate()
  const { company, loading: companyLoading, error: companyError } = useCompany(companySlug)

  // ── Auth ─────────────────────────────────────────────────
  const [manager, setManager] = useState(() => getSession(companySlug))

  // ── Requests state ──────────────────────────────────────
  const [requests, setRequests]  = useState([])
  const [reqLoading, setReqLoading] = useState(true)
  const [showAll, setShowAll]       = useState(false)
  const [areaAll, setAreaAll]       = useState(false)
  const [areaMine, setAreaMine]     = useState(true)
  const [liveIndicator, setLive] = useState(false)

  // ── Inventory state ─────────────────────────────────────
  const [inventoryItems, setInventoryItems] = useState([])
  const [invLoading, setInvLoading]         = useState(true)
  const [showAddModal, setShowAddModal]     = useState(false)

  // ── Active tab ──────────────────────────────────────────
  const [activeTab, setActiveTab] = useState('requests')

  // ── Confirm delete state ─────────────────────────────────
  const [confirmItem, setConfirmItem] = useState(null)

  // ── Table view controls ─────────────────────────────────
  const [tableView, setTableView]       = useState('log')     // 'log' | 'summary'
  const [searchFilter, setSearchFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [timeRange, setTimeRange]       = useState('all')     // 'all' | '7d' | '30d'
  const [summarySort, setSummarySort]   = useState({ col: 'count', dir: 'desc' })
  const [filtersOpen, setFiltersOpen]   = useState(false)
  const [exportOpen, setExportOpen]     = useState(false)
  const exportRef                       = useRef(null)

  // ── Analytics trend mode ─────────────────────────────────
  const [trendMode, setTrendMode] = useState('daily') // 'daily' | 'weekly' | 'monthly'

  // ── Location + item filters ──────────────────────────────
  const [filterPlant, setFilterPlant] = useState('all')
  const [filterDept, setFilterDept]   = useState('all')
  const [filterItem, setFilterItem]   = useState('all')

  // ── Undo toast ───────────────────────────────────────────
  const [undoToast, setUndoToast] = useState(null) // { requestId, prevStatus, newStatus }
  const undoPendingRef = useRef(null) // { timeoutId, requestId, newStatus }

  // ── Fetch requests ──────────────────────────────────────
  const fetchRequests = useCallback(async (companyId) => {
    const { data, error } = await supabase
      .from('supply_requests').select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false }).limit(200)
    if (!error) setRequests(data ?? [])
    setReqLoading(false)
  }, [])

  // ── Fetch inventory ─────────────────────────────────────
  const fetchInventory = useCallback(async (companyId) => {
    const { data, error } = await supabase
      .from('inventory_items').select('*')
      .eq('company_id', companyId)
      .order('category').order('name')
    if (!error) setInventoryItems(data ?? [])
    setInvLoading(false)
  }, [])

  useEffect(() => {
    if (!company) return
    fetchRequests(company.id)
    fetchInventory(company.id)
  }, [company, fetchRequests, fetchInventory])

  // Close export dropdown on outside click
  useEffect(() => {
    function handler(e) {
      if (exportRef.current && !exportRef.current.contains(e.target)) setExportOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // ── Real-time subscription ──────────────────────────────
  useEffect(() => {
    if (!company) return
    const channel = supabase
      .channel(`supply_requests:${company.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'supply_requests', filter: `company_id=eq.${company.id}` },
        (payload) => {
          setLive(true)
          setTimeout(() => setLive(false), 1500)
          setRequests(prev => {
            if (payload.eventType === 'INSERT') return [payload.new, ...prev]
            if (payload.eventType === 'UPDATE') return prev.map(r => r.id === payload.new.id ? payload.new : r)
            if (payload.eventType === 'DELETE') return prev.filter(r => r.id !== payload.old.id)
            return prev
          })
        })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [company])

  // ── Commit a pending status write to DB ─────────────────
  async function commitStatusWrite(requestId, newStatus, prevStatus) {
    const { error } = await supabase.from('supply_requests').update({ status: newStatus }).eq('id', requestId)
    if (error) {
      setRequests(prev => prev.map(r => r.id === requestId ? { ...r, status: prevStatus } : r))
    }
  }

  // ── Status update with undo toast ───────────────────────
  function updateStatus(requestId, newStatus) {
    // If there's already a pending write, commit it immediately before starting a new one
    if (undoPendingRef.current) {
      clearTimeout(undoPendingRef.current.timeoutId)
      commitStatusWrite(undoPendingRef.current.requestId, undoPendingRef.current.newStatus, undoPendingRef.current.prevStatus)
      undoPendingRef.current = null
    }

    const prevStatus = requests.find(r => r.id === requestId)?.status
    setRequests(prev => prev.map(r => r.id === requestId ? { ...r, status: newStatus } : r))
    setUndoToast({ requestId, prevStatus, newStatus })

    const timeoutId = setTimeout(() => {
      commitStatusWrite(requestId, newStatus, prevStatus)
      setUndoToast(null)
      undoPendingRef.current = null
    }, 4000)

    undoPendingRef.current = { timeoutId, requestId, newStatus, prevStatus }
  }

  function handleUndo() {
    if (!undoPendingRef.current) return
    clearTimeout(undoPendingRef.current.timeoutId)
    const { requestId, prevStatus } = undoPendingRef.current
    setRequests(prev => prev.map(r => r.id === requestId ? { ...r, status: prevStatus } : r))
    setUndoToast(null)
    undoPendingRef.current = null
  }

  // ── Delete inventory item ───────────────────────────────
  async function deleteInventoryItem(item) {
    // Remove DB row
    await supabase.from('inventory_items').delete().eq('id', item.id)

    // Remove from storage if it's our bucket
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
    if (item.image_url && item.image_url.startsWith(supabaseUrl)) {
      const storagePath = item.image_url
        .split('/storage/v1/object/public/inventory_images/')[1]
        ?.split('?')[0]
      if (storagePath) {
        await supabase.storage.from('inventory_images').remove([storagePath])
      }
    }

    setInventoryItems(prev => prev.filter(i => i.id !== item.id))
  }

  // ── Toggle inventory item active status ──────────────────
  async function toggleItemStatus(item) {
    const newStatus = !item.is_active
    
    // Optimistic update
    setInventoryItems(prev => prev.map(i => 
      i.id === item.id ? { ...i, is_active: newStatus } : i
    ))

    const { error } = await supabase
      .from('inventory_items')
      .update({ is_active: newStatus })
      .eq('id', item.id)

    if (error) {
      // Revert if error
      setInventoryItems(prev => prev.map(i => 
        i.id === item.id ? { ...i, is_active: !newStatus } : i
      ))
    }
  }

  // ── Area filter logic ────────────────────────────────────
  const hasArea = manager && (manager.plant || manager.department || manager.zone || manager.line)

  function isMyArea(req) {
    if (!hasArea) return false
    return (
      (!manager.plant      || req.plant      === manager.plant)      &&
      (!manager.department || req.department === manager.department) &&
      (!manager.zone       || req.zone       === manager.zone)       &&
      (!manager.line       || req.line       === manager.line)
    )
  }

  // ── Derived data ────────────────────────────────────────
  const bothActive = areaAll && areaMine
  const displayReqs = (() => {
    if (!areaAll && !areaMine) return []
    if (areaAll && !areaMine)  return requests
    if (!areaAll && areaMine)  return requests.filter(isMyArea)
    return requests
  })()

  // Unique values for location + item filters
  const allPlants = [...new Set(displayReqs.map(r => r.plant).filter(v => v && v !== 'N/A'))].sort()
  const allDepts  = [...new Set(displayReqs.map(r => r.department).filter(v => v && v !== 'N/A'))].sort()
  const allItems  = [...new Set(displayReqs.map(r => r.item_name).filter(Boolean))].sort()

  // Apply all filters — stats, charts and table all react to them
  const filteredBase = (() => {
    let base = displayReqs
    if (timeRange !== 'all') {
      const cutoff = Date.now() - (timeRange === '7d' ? 7 : 30) * 86400000
      base = base.filter(r => new Date(r.created_at).getTime() > cutoff)
    }
    if (statusFilter !== 'All') {
      base = base.filter(r => r.status === statusFilter)
    } else {
      base = base.filter(r => showAll || (r.status !== 'Fulfilled' && r.status !== 'Denied'))
    }
    if (searchFilter.trim()) {
      const q = searchFilter.trim().toLowerCase()
      base = base.filter(r => r.item_name.toLowerCase().includes(q))
    }
    if (filterPlant !== 'all') base = base.filter(r => r.plant === filterPlant)
    if (filterDept  !== 'all') base = base.filter(r => r.department === filterDept)
    if (filterItem  !== 'all') base = base.filter(r => r.item_name === filterItem)
    return base
  })()

  const counts = { Pending: 0, Ordered: 0, Fulfilled: 0, Denied: 0 }
  filteredBase.forEach(r => { if (counts[r.status] !== undefined) counts[r.status]++ })

  const filteredMineReqs = filteredBase.filter(isMyArea)
  const mineCounts = { Pending: 0, Ordered: 0, Fulfilled: 0, Denied: 0 }
  if (bothActive) filteredMineReqs.forEach(r => { if (mineCounts[r.status] !== undefined) mineCounts[r.status]++ })

  const visible = bothActive
    ? [...filteredBase.filter(r => isMyArea(r)), ...filteredBase.filter(r => !isMyArea(r))]
    : filteredBase

  const rawSummaryRows = buildSummaryRows(visible, requests)
  const summaryRows = [...rawSummaryRows].sort((a, b) => {
    const { col, dir } = summarySort
    let av = col === 'qty' ? a.totalQty : col === 'last' ? a.lastRequested : col === 'name' ? a.item_name : a.count
    let bv = col === 'qty' ? b.totalQty : col === 'last' ? b.lastRequested : col === 'name' ? b.item_name : b.count
    if (av < bv) return dir === 'asc' ? -1 : 1
    if (av > bv) return dir === 'asc' ?  1 : -1
    return 0
  })

  // Charts react to all filters + trend mode
  const { topItems, volumeData, byArea, byStatus } = buildChartData(filteredBase, bothActive ? filteredMineReqs : [], trendMode)

  const activeFilterCount = (timeRange !== 'all' ? 1 : 0) + (statusFilter !== 'All' ? 1 : 0) + (searchFilter.trim() ? 1 : 0) + (filterPlant !== 'all' ? 1 : 0) + (filterDept !== 'all' ? 1 : 0) + (filterItem !== 'all' ? 1 : 0)
  const areaLabel = areaAll && areaMine ? 'All Areas + My Area' : areaAll ? 'All Areas' : areaMine ? 'My Area' : 'None'

  function handleExportPDF() {
    setExportOpen(false)
    exportPDF({ rows: visible, view: tableView, summaryRows, company, areaLabel, timeRange, statusFilter, searchFilter })
  }
  function handleExportCSV() {
    setExportOpen(false)
    exportCSV(tableView === 'summary' ? summaryRows : visible, tableView)
  }

  function handleLogout() {
    clearSession(companySlug)
    setManager(null)
    navigate(`/${companySlug}`)
  }

  // ── Render ──────────────────────────────────────────────
  if (companyLoading || !company) return <div className={styles.center}>Loading…</div>
  if (companyError)               return <div className={styles.center}>{companyError}</div>

  // Login gate
  if (!manager) return (
    <LoginPage
      company={company}
      companySlug={companySlug}
      onLogin={m => setManager(m)}
    />
  )

  if (reqLoading) return <div className={styles.center}>Loading…</div>

  return (
    <div className={styles.page}>

      {/* ── Page Header ── */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <button className={styles.topBarBrand} onClick={() => navigate(`/${companySlug}`)} title="Home">
            {company?.logo_url
              ? <img src={company.logo_url} alt={`${company.name} logo`} className={styles.headerLogo} />
              : <Gauge size={20} color="var(--green)" />
            }
            <span className={styles.headerTitle}>Supply Dashboard</span>
          </button>
          <span className={`${styles.liveDot} ${liveIndicator ? styles.livePulse : ''}`} title="Live" />
        </div>
        <div className={styles.headerRight}>
          <span className={styles.managerName}>{manager.name}</span>
          <button className={styles.logoutBtn} onClick={handleLogout} title="Log out">
            <LogOut size={15} />
          </button>
        </div>
      </header>

      {/* ── Tab Navigation ── */}
      <nav className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === 'requests' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('requests')}
        >
          Requests
          {counts.Pending > 0 && <span className={styles.tabBadge}>{counts.Pending}</span>}
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'analytics' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('analytics')}
        >
          <BarChart2 size={14} />
          Analytics
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'inventory' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('inventory')}
        >
          <Package size={14} />
          Inventory
          <span className={styles.tabCount}>{inventoryItems.length}</span>
        </button>

        {/* ── Area filter toggles + desktop inline filters ── */}
        {(activeTab === 'requests' || activeTab === 'analytics') && (
          <div className={styles.areaFilters}>
            <button
              className={`${styles.areaFilterBtn} ${areaAll ? styles.areaFilterActive : ''}`}
              onClick={() => setAreaAll(v => !v)}
            >
              All Areas
            </button>
            {hasArea && (
              <button
                className={`${styles.areaFilterBtn} ${areaMine ? styles.areaFilterMineActive : ''}`}
                onClick={() => setAreaMine(v => !v)}
              >
                My Area
              </button>
            )}
            {/* Desktop-only inline filters */}
            <div className={styles.navInlineFilters}>
              <div className={styles.searchWrap}>
                <Search size={13} className={styles.searchIcon} />
                <input
                  className={styles.searchInput}
                  placeholder="Filter by item…"
                  value={searchFilter}
                  onChange={e => setSearchFilter(e.target.value)}
                />
                {searchFilter && (
                  <button className={styles.searchClear} onClick={() => setSearchFilter('')} aria-label="Clear search">
                    <X size={11} />
                  </button>
                )}
              </div>
              <select
                className={styles.navSelect}
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
              >
                <option value="All">All Statuses</option>
                <option value="Pending">Pending</option>
                <option value="Ordered">Ordered</option>
                <option value="Fulfilled">Fulfilled</option>
                <option value="Denied">Denied</option>
              </select>
              <select
                className={styles.navSelect}
                value={timeRange}
                onChange={e => setTimeRange(e.target.value)}
              >
                <option value="all">All Time</option>
                <option value="7d">7 Days</option>
                <option value="30d">30 Days</option>
              </select>
              {allPlants.length > 0 && (
                <select className={styles.navSelect} value={filterPlant} onChange={e => setFilterPlant(e.target.value)}>
                  <option value="all">All Plants</option>
                  {allPlants.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              )}
              {allDepts.length > 0 && (
                <select className={styles.navSelect} value={filterDept} onChange={e => setFilterDept(e.target.value)}>
                  <option value="all">All Depts</option>
                  {allDepts.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              )}
              {allItems.length > 0 && (
                <select className={styles.navSelect} value={filterItem} onChange={e => setFilterItem(e.target.value)}>
                  <option value="all">All Items</option>
                  {allItems.map(i => <option key={i} value={i}>{i}</option>)}
                </select>
              )}
            </div>
          </div>
        )}
      </nav>

      {/* Stat Pills — always visible between tab nav and content */}
      <div className={styles.mobileStatPills}>
        {Object.entries(STATUS_META).map(([status, { label, color }]) => (
          <span key={status} className={styles.mobileStatPill} style={{ '--s': color }}>
            {counts[status]} {label}
          </span>
        ))}
      </div>

      {/* ════════════════════════════════════════════════════
          REQUESTS TAB
      ════════════════════════════════════════════════════ */}
      {activeTab === 'requests' && (
        <>
          {/* Controls */}
          <div className={styles.controls}>

            {/* ── Mobile-only top bar ── */}
            <div className={styles.mobileControlsBar}>
              <div className={styles.viewToggle}>
                <button
                  className={`${styles.viewBtn} ${tableView === 'log' ? styles.viewBtnActive : ''}`}
                  onClick={() => setTableView('log')}
                >
                  <List size={13} /> Log
                </button>
                <button
                  className={`${styles.viewBtn} ${tableView === 'summary' ? styles.viewBtnActive : ''}`}
                  onClick={() => setTableView('summary')}
                >
                  <BarChart2 size={13} /> Summary
                </button>
              </div>
              <div className={styles.exportWrap} ref={exportRef}>
                <button
                  className={`${styles.mobileExportBtn} ${exportOpen ? styles.mobileExportBtnActive : ''}`}
                  onClick={() => setExportOpen(v => !v)}
                >
                  <Download size={13} /> Export
                </button>
                {exportOpen && (
                  <div className={styles.exportDropdown}>
                    <button className={styles.exportDropdownItem} onClick={handleExportPDF}>
                      <FileText size={13} />
                      <span><strong>Report</strong> <em>.pdf</em></span>
                    </button>
                    <button className={styles.exportDropdownItem} onClick={handleExportCSV}>
                      <Table2 size={13} />
                      <span><strong>Raw</strong> <em>.csv</em></span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* ── Desktop-only top bar ── */}
            <div className={styles.controlsTop}>
              <div className={styles.controlsLeft}>
                <div className={styles.viewToggle}>
                  <button
                    className={`${styles.viewBtn} ${tableView === 'log' ? styles.viewBtnActive : ''}`}
                    onClick={() => setTableView('log')}
                  >
                    <List size={13} /> Log
                  </button>
                  <button
                    className={`${styles.viewBtn} ${tableView === 'summary' ? styles.viewBtnActive : ''}`}
                    onClick={() => setTableView('summary')}
                  >
                    <BarChart2 size={13} /> Summary
                  </button>
                </div>
                {tableView === 'log' && statusFilter === 'All' && (
                  <label className={styles.toggle}>
                    <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} />
                    +Closed
                  </label>
                )}
              </div>
              <div className={styles.controlsRight}>
                <div className={styles.exportWrap} ref={exportRef}>
                  <button
                    className={`${styles.exportBtn} ${exportOpen ? styles.exportBtnActive : ''}`}
                    onClick={() => setExportOpen(v => !v)}
                  >
                    <Download size={14} />
                    <span className={styles.exportBtnLabel}>Export</span>
                    <ChevronDown size={11} />
                  </button>
                  {exportOpen && (
                    <div className={styles.exportDropdown}>
                      <button className={styles.exportDropdownItem} onClick={handleExportPDF}>
                        <FileText size={13} />
                        <span><strong>Report</strong> <em>.pdf</em></span>
                      </button>
                      <button className={styles.exportDropdownItem} onClick={handleExportCSV}>
                        <Table2 size={13} />
                        <span><strong>Raw</strong> <em>.csv</em></span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

          </div>

          {/* ── Log View ── */}
          {tableView === 'log' && (
            <>
              {visible.length === 0 && (
                <div className={styles.empty}>
                  {!areaAll && !areaMine
                    ? 'Select a filter above to view requests.'
                    : searchFilter
                    ? `No results for "${searchFilter}".`
                    : 'No requests match the current filters.'}
                </div>
              )}
              {visible.length > 0 && (
                <>
                  {/* Mobile Cards */}
                  <div className={styles.mobileList}>
                    {visible.map(req => (
                      <MobileCard
                        key={req.id}
                        req={req}
                        onAction={updateStatus}
                        highlight={bothActive && isMyArea(req)}
                      />
                    ))}
                  </div>

                  {/* Desktop Table */}
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Time</th>
                          <th>Item</th>
                          <th>Location</th>
                          <th>Qty</th>
                          <th>Status</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visible.map(req => {
                          const meta    = STATUS_META[req.status] ?? STATUS_META.Pending
                          const actions = NEXT_ACTIONS[req.status] ?? []
                          const mine    = bothActive && isMyArea(req)
                          return (
                            <tr key={req.id} className={mine ? styles.trMine : ''}>
                              <td className={styles.tdTime}>{timeAgo(req.created_at)}</td>
                              <td className={styles.tdItem}>
                                <div className={styles.itemCell}>
                                  {req.image_url && (
                                    <img src={req.image_url} alt={req.item_name} className={styles.itemThumb} />
                                  )}
                                  {req.item_name}
                                </div>
                              </td>
                              <td className={styles.tdLocation}>{locationStr(req)}</td>
                              <td className={styles.tdQty}>{req.quantity ?? 1}</td>
                              <td className={styles.tdStatus}>
                                <span className={styles.statusBadge} style={{ '--s-color': meta.color }}>
                                  {meta.label}
                                </span>
                              </td>
                              <td className={styles.tdActionCol}>
                                <div className={styles.actionsCell}>
                                  {actions.map(action => (
                                    <button
                                      key={action}
                                      className={styles.actionBtn}
                                      style={{ '--a-color': STATUS_META[action].color }}
                                      onClick={() => updateStatus(req.id, action)}
                                    >
                                      {action}
                                    </button>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}

          {/* ── Summary View ── */}
          {tableView === 'summary' && (
            <SummaryTable
              rows={summaryRows}
              sort={summarySort}
              onSort={col => setSummarySort(prev =>
                prev.col === col && prev.dir === 'desc'
                  ? { col, dir: 'asc' }
                  : { col, dir: 'desc' }
              )}
              onDrillDown={itemName => {
                setSearchFilter(itemName)
                setStatusFilter('All')
                setShowAll(true)
                setTableView('log')
              }}
              styles={styles}
            />
          )}
        </>
      )}

      {/* ════════════════════════════════════════════════════
          ANALYTICS TAB
      ════════════════════════════════════════════════════ */}
      {activeTab === 'analytics' && (
        <section className={styles.analytics}>
          <div className={styles.chartsGrid}>

            {/* ── Chart 1: Most Requested Items ── */}
            <div className={styles.chartCard}>
              <div className={styles.chartTitleRow}>
                <h3 className={styles.chartTitle}>Most Requested Items</h3>
                {searchFilter
                  ? <button className={styles.chartFilterClear} onClick={() => setSearchFilter('')}>{searchFilter} ×</button>
                  : <span className={styles.chartHint}>click bar to filter table</span>
                }
              </div>
              {topItems.length === 0
                ? <div className={styles.noData}>No data — adjust filters to see results.</div>
                : (
                  <ResponsiveContainer width="100%" height={230}>
                    <BarChart data={topItems} margin={{ top: 5, right: 10, left: -10, bottom: 55 }}
                      style={{ cursor: 'pointer' }}
                      onClick={d => d?.activeLabel && setSearchFilter(prev => prev === d.activeLabel ? '' : d.activeLabel)}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,31,61,0.07)" />
                      <XAxis dataKey="name" tick={{ fill: 'rgba(15,31,61,0.55)', fontSize: 11 }} angle={-40} textAnchor="end" interval={0} />
                      <YAxis tick={{ fill: 'rgba(15,31,61,0.55)', fontSize: 12 }} allowDecimals={false} />
                      <Tooltip {...tooltipStyle} />
                      {bothActive
                        ? <>
                            <Legend verticalAlign="top" height={24} iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                            <Bar dataKey="other" name="Other Areas" stackId="a" fill="#1B6E3C">
                              {topItems.map((e, i) => <Cell key={i} fill={searchFilter && e.name !== searchFilter ? 'rgba(27,110,60,0.25)' : '#1B6E3C'} />)}
                            </Bar>
                            <Bar dataKey="mine" name="My Area" stackId="a" fill="#F59E0B" radius={[4,4,0,0]}>
                              {topItems.map((e, i) => <Cell key={i} fill={searchFilter && e.name !== searchFilter ? 'rgba(245,158,11,0.25)' : '#F59E0B'} />)}
                            </Bar>
                          </>
                        : (
                          <Bar dataKey="total" name="Requests" fill="#1B6E3C" radius={[4,4,0,0]}>
                            {topItems.map((e, i) => <Cell key={i} fill={searchFilter && e.name !== searchFilter ? 'rgba(27,110,60,0.25)' : '#1B6E3C'} />)}
                          </Bar>
                        )
                      }
                    </BarChart>
                  </ResponsiveContainer>
                )
              }
            </div>

            {/* ── Chart 2: Requests by Area ── */}
            <div className={styles.chartCard}>
              <h3 className={styles.chartTitle}>Requests by Area</h3>
              {byArea.length === 0
                ? <div className={styles.noData}>No location data yet.</div>
                : (
                  <ResponsiveContainer width="100%" height={230}>
                    <BarChart data={byArea} layout="vertical" margin={{ top: 4, right: 12, left: 0, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,31,61,0.07)" />
                      <XAxis type="number" allowDecimals={false} tick={{ fill: 'rgba(15,31,61,0.55)', fontSize: 11 }} />
                      <YAxis type="category" dataKey="name" width={140} tick={{ fill: 'rgba(15,31,61,0.55)', fontSize: 10 }} />
                      <Tooltip {...tooltipStyle} />
                      <Bar dataKey="count" name="Requests" fill="#0F1F3D" radius={[0,4,4,0]}>
                        {byArea.map((_, i) => <Cell key={i} fill={i === 0 ? '#1B6E3C' : `rgba(15,31,61,${0.6 - i * 0.06})`} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )
              }
            </div>

            {/* ── Chart 3: Requests by Status ── */}
            <div className={styles.chartCard}>
              <h3 className={styles.chartTitle}>Requests by Status</h3>
              {byStatus.length === 0
                ? <div className={styles.noData}>No data yet.</div>
                : (
                  <ResponsiveContainer width="100%" height={230}>
                    <PieChart>
                      <Pie
                        data={byStatus}
                        dataKey="count"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={85}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        labelLine={false}
                      >
                        {byStatus.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                      </Pie>
                      <Tooltip {...tooltipStyle} />
                      <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                )
              }
            </div>

            {/* ── Chart 4: Volume Trend ── */}
            <div className={styles.chartCard}>
              <div className={styles.chartTitleRow}>
                <h3 className={styles.chartTitle}>Volume Trend</h3>
                <div className={styles.trendSelector}>
                  {[['daily','Daily'],['weekly','Weekly'],['monthly','Monthly']].map(([v,l]) => (
                    <button
                      key={v}
                      className={`${styles.trendBtn} ${trendMode === v ? styles.trendBtnActive : ''}`}
                      onClick={() => setTrendMode(v)}
                    >{l}</button>
                  ))}
                </div>
              </div>
              <ResponsiveContainer width="100%" height={210}>
                <AreaChart data={volumeData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                  <defs>
                    <linearGradient id="volGradAll" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#2563EB" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#2563EB" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="volGradMine" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#F59E0B" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#F59E0B" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,31,61,0.07)" />
                  <XAxis dataKey="date" tick={{ fill: 'rgba(15,31,61,0.55)', fontSize: 11 }} />
                  <YAxis tick={{ fill: 'rgba(15,31,61,0.55)', fontSize: 12 }} allowDecimals={false} />
                  <Tooltip {...tooltipStyle} />
                  {bothActive && <Legend verticalAlign="top" height={24} iconSize={10} wrapperStyle={{ fontSize: 11 }} />}
                  <Area type="monotone" dataKey="all"  name="All Areas" stroke="#2563EB" strokeWidth={2} fill="url(#volGradAll)"  dot={false} />
                  {bothActive && <Area type="monotone" dataKey="mine" name="My Area" stroke="#F59E0B" strokeWidth={2} fill="url(#volGradMine)" dot={false} />}
                </AreaChart>
              </ResponsiveContainer>
            </div>

          </div>
        </section>
      )}

      {/* ════════════════════════════════════════════════════
          INVENTORY TAB
      ════════════════════════════════════════════════════ */}
      {activeTab === 'inventory' && (
        <div className={styles.inventorySection}>

          {/* Inventory Header */}
          <div className={styles.invHeader}>
            <div>
              <h2 className={styles.invTitle}>Inventory Items</h2>
              <p className={styles.invSubtitle}>{inventoryItems.filter(i => i.is_active).length} of {inventoryItems.length} items visible to floor workers</p>
            </div>
            <button className={styles.addItemBtn} onClick={() => setShowAddModal(true)}>
              <Plus size={16} />
              Add Item
            </button>
          </div>

          {/* Inventory Grid */}
          {invLoading ? (
            <div className={styles.invLoading}>Loading inventory…</div>
          ) : inventoryItems.length === 0 ? (
            <div className={styles.invEmpty}>
              <Package size={40} color="var(--text-muted)" />
              <p>No items yet. Add your first item above.</p>
            </div>
          ) : (
            <div className={styles.invGrid}>
              {inventoryItems.map(item => (
                <div 
                  key={item.id} 
                  className={`${styles.invCard} ${!item.is_active ? styles.invCardInactive : ''}`}
                >
                  <div className={styles.invImgWrap} onClick={() => toggleItemStatus(item)}>
                    {item.image_url ? (
                      <img src={item.image_url} alt={item.name} className={styles.invImg} loading="lazy" />
                    ) : (
                      <div className={styles.invImgPlaceholder}>
                        <Upload size={22} color="var(--text-muted)" />
                        <span>Syncing…</span>
                      </div>
                    )}
                    <button 
                      className={`${styles.selectionCircle} ${item.is_active ? styles.selectionActive : ''}`}
                      aria-label={item.is_active ? 'Deactivate item' : 'Activate item'}
                    >
                      {item.is_active && <CheckCircle2 size={16} />}
                    </button>
                  </div>
                  <div className={styles.invCardFooter}>
                    <div className={styles.invItemInfo}>
                      <span className={styles.invItemName}>{item.name}</span>
                      <span className={styles.invCatBadge}>{item.category}</span>
                    </div>
                    <button
                      className={styles.deleteBtn}
                      onClick={() => setConfirmItem(item)}
                      aria-label={`Delete ${item.name}`}
                      title="Remove from inventory"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Mobile Filter FAB + Bottom Sheet (page-level, all tabs) ── */}
      {activeTab !== 'inventory' && (
        <>
          <button
            className={`${styles.mobileFilterFab} ${activeFilterCount > 0 ? styles.mobileFilterFabActive : ''}`}
            onClick={() => setFiltersOpen(v => !v)}
            aria-label="Open filters"
          >
            <SlidersHorizontal size={15} />
            {activeFilterCount > 0 && (
              <span className={styles.mobileFilterBadge}>{activeFilterCount}</span>
            )}
          </button>

          {filtersOpen && (
            <div className={styles.mobileFilterBackdrop} onClick={() => setFiltersOpen(false)} />
          )}

          <div className={`${styles.mobileFilterSheet} ${filtersOpen ? styles.mobileFilterSheetOpen : ''}`}>
            <div className={styles.mobileFilterHandle} />
            <div className={styles.mobileFilterSheetHeader}>
              <span className={styles.mobileFilterSheetTitle}>Filters</span>
              <button className={styles.mobileFilterClose} onClick={() => setFiltersOpen(false)}>
                <X size={16} />
              </button>
            </div>

            <div className={styles.mobileFilterSection}>
              <span className={styles.mobileFilterLabel}>Item</span>
              <div className={styles.mobileSearchWrap}>
                <Search size={13} className={styles.searchIcon} />
                <input
                  className={styles.mobileSearchInput}
                  placeholder="Filter by item…"
                  value={searchFilter}
                  onChange={e => setSearchFilter(e.target.value)}
                />
                {searchFilter && (
                  <button className={styles.searchClear} onClick={() => setSearchFilter('')} aria-label="Clear search">
                    <X size={11} />
                  </button>
                )}
              </div>
            </div>

            <div className={styles.mobileFilterSection}>
              <span className={styles.mobileFilterLabel}>Time Range</span>
              <div className={styles.filterGroup}>
                {['all', '7d', '30d'].map(r => (
                  <button key={r} className={`${styles.filterChip} ${timeRange === r ? styles.filterChipActive : ''}`} onClick={() => setTimeRange(r)}>
                    {r === 'all' ? 'All Time' : r === '7d' ? '7 Days' : '30 Days'}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.mobileFilterSection}>
              <span className={styles.mobileFilterLabel}>Status</span>
              <div className={styles.filterGroup}>
                {['All', 'Pending', 'Ordered', 'Fulfilled', 'Denied'].map(s => (
                  <button key={s}
                    className={`${styles.filterChip} ${statusFilter === s ? (s === 'All' ? styles.filterChipActive : styles.filterChipStatus) : ''}`}
                    style={statusFilter === s && s !== 'All' ? { '--fc': STATUS_META[s]?.color } : {}}
                    onClick={() => setStatusFilter(s)}
                  >{s}</button>
                ))}
              </div>
            </div>

            {tableView === 'log' && statusFilter === 'All' && (
              <div className={styles.mobileFilterSection}>
                <label className={`${styles.toggle} ${styles.mobileToggle}`}>
                  <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} />
                  Show Closed Requests
                </label>
              </div>
            )}

            {allPlants.length > 0 && (
              <div className={styles.mobileFilterSection}>
                <span className={styles.mobileFilterLabel}>Plant</span>
                <div className={styles.filterGroup}>
                  <button className={`${styles.filterChip} ${filterPlant === 'all' ? styles.filterChipActive : ''}`} onClick={() => setFilterPlant('all')}>All</button>
                  {allPlants.map(p => (
                    <button key={p} className={`${styles.filterChip} ${filterPlant === p ? styles.filterChipActive : ''}`} onClick={() => setFilterPlant(p)}>{p}</button>
                  ))}
                </div>
              </div>
            )}

            {allDepts.length > 0 && (
              <div className={styles.mobileFilterSection}>
                <span className={styles.mobileFilterLabel}>Department</span>
                <div className={styles.filterGroup}>
                  <button className={`${styles.filterChip} ${filterDept === 'all' ? styles.filterChipActive : ''}`} onClick={() => setFilterDept('all')}>All</button>
                  {allDepts.map(d => (
                    <button key={d} className={`${styles.filterChip} ${filterDept === d ? styles.filterChipActive : ''}`} onClick={() => setFilterDept(d)}>{d}</button>
                  ))}
                </div>
              </div>
            )}

            {allItems.length > 0 && (
              <div className={styles.mobileFilterSection}>
                <span className={styles.mobileFilterLabel}>Item</span>
                <div className={styles.filterGroup}>
                  <button className={`${styles.filterChip} ${filterItem === 'all' ? styles.filterChipActive : ''}`} onClick={() => setFilterItem('all')}>All</button>
                  {allItems.map(i => (
                    <button key={i} className={`${styles.filterChip} ${filterItem === i ? styles.filterChipActive : ''}`} onClick={() => setFilterItem(i)}>{i}</button>
                  ))}
                </div>
              </div>
            )}

            <div className={styles.mobileFilterActions}>
              {activeFilterCount > 0 && (
                <button className={styles.mobileFilterClear}
                  onClick={() => { setSearchFilter(''); setTimeRange('all'); setStatusFilter('All'); setFilterPlant('all'); setFilterDept('all'); setFilterItem('all') }}
                >Clear All</button>
              )}
              <button className={styles.mobileFilterApply} onClick={() => setFiltersOpen(false)}>Done</button>
            </div>
          </div>
        </>
      )}

      {/* ── Confirm Delete Modal ── */}
      {confirmItem && (
        <ConfirmDeleteModal
          item={confirmItem}
          onConfirm={() => { deleteInventoryItem(confirmItem); setConfirmItem(null) }}
          onCancel={() => setConfirmItem(null)}
        />
      )}

      {/* ── Add Item Modal ── */}
      {showAddModal && (
        <AddItemModal
          company={company}
          onSuccess={() => {
            setShowAddModal(false)
            fetchInventory(company.id)
          }}
          onImageReady={(id, url) => {
            setInventoryItems(prev => prev.map(i => i.id === id ? { ...i, image_url: url } : i))
          }}
          onClose={() => setShowAddModal(false)}
        />
      )}

      {/* ── Undo Toast ── */}
      {undoToast && (
        <div className={styles.undoToast}>
          <span>
            Marked as{' '}
            <strong style={{ color: STATUS_META[undoToast.newStatus]?.color }}>
              {undoToast.newStatus}
            </strong>
          </span>
          <button className={styles.undoBtn} onClick={handleUndo}>Undo</button>
        </div>
      )}

    </div>
  )
}
