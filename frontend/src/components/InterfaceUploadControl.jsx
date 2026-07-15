import { useRef, useState } from 'react'
import {
  fetchInterfaceRegistry,
  uploadInterface,
} from '../api/rosApi.js'

const ACCEPTED_EXTENSIONS = ['.msg', '.srv', '.action']

export function InterfaceUploadControl() {
  const inputRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState(null)
  const [registry, setRegistry] = useState(null)
  const [showRegistry, setShowRegistry] = useState(false)

  const chooseFile = () => inputRef.current?.click()

  const handleFile = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    const extension = ACCEPTED_EXTENSIONS.find((item) =>
      file.name.toLowerCase().endsWith(item),
    )
    if (!extension) {
      setFeedback({ tone: 'error', text: '.msg, .srv, .action 파일만 가능합니다.' })
      return
    }

    setBusy(true)
    setFeedback(null)
    try {
      const payload = await uploadInterface(file)
      const item = payload.data
      setFeedback({
        tone: item.parsed_error ? 'warning' : 'success',
        text: item.parsed_error
          ? `${item.file_name} 저장됨 · 파싱 경고: ${item.parsed_error}`
          : `${item.file_name} (${item.file_kind}) 등록 완료`,
      })
      if (showRegistry) await loadRegistry(true)
    } catch (error) {
      setFeedback({ tone: 'error', text: error.message })
    } finally {
      setBusy(false)
    }
  }

  const loadRegistry = async (keepOpen = false) => {
    if (showRegistry && !keepOpen) {
      setShowRegistry(false)
      return
    }
    setBusy(true)
    try {
      const payload = await fetchInterfaceRegistry()
      setRegistry(payload.data)
      setShowRegistry(true)
    } catch (error) {
      setFeedback({ tone: 'error', text: error.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="interface-upload-control">
      <input
        accept=".msg,.srv,.action"
        className="interface-file-input"
        onChange={handleFile}
        ref={inputRef}
        type="file"
      />
      <button className="interface-upload-button" disabled={busy} onClick={chooseFile} type="button">
        {busy ? '처리 중…' : '타입 업로드'}
      </button>
      <button className="interface-registry-button" disabled={busy} onClick={() => loadRegistry()} type="button">
        등록 목록
      </button>
      {feedback && (
        <span className={`interface-upload-feedback ${feedback.tone}`} role="status">
          {feedback.text}
        </span>
      )}
      {showRegistry && (
        <div className="interface-registry-panel">
          <div className="interface-registry-heading">
            <strong>등록된 타입</strong>
            <button aria-label="등록 목록 닫기" onClick={() => setShowRegistry(false)} type="button">×</button>
          </div>
          <RegistryGroup items={registry?.messages} label="Message" />
          <RegistryGroup items={registry?.services} label="Service" />
          <RegistryGroup items={registry?.actions} label="Action" />
        </div>
      )}
    </div>
  )
}

function RegistryGroup({ items = [], label }) {
  return (
    <div className="interface-registry-group">
      <span>{label} ({items.length})</span>
      {items.length ? (
        <ul>{items.map((item) => <li key={item.file_name}>{item.file_name}</li>)}</ul>
      ) : <small>등록 없음</small>}
    </div>
  )
}
