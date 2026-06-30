import { useState } from 'react'
import { useAuth } from '../lib/auth'

type Modo = 'entrar' | 'criar' | 'magic'

export default function LoginPage() {
  const { signInPassword, signUpPassword, signInMagicLink } = useAuth()
  const [modo, setModo] = useState<Modo>('entrar')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    setOk(null)
    if (!email.trim()) {
      setErro('Digite seu e-mail.')
      return
    }
    if (modo !== 'magic' && senha.length < 6) {
      setErro('A senha precisa ter pelo menos 6 caracteres.')
      return
    }
    setLoading(true)
    try {
      if (modo === 'entrar') {
        await signInPassword(email.trim(), senha)
      } else if (modo === 'criar') {
        const { precisaConfirmarEmail } = await signUpPassword(email.trim(), senha)
        if (precisaConfirmarEmail) {
          setOk('Cadastro criado! Confirme pelo link enviado ao seu e-mail e depois faça login.')
        }
      } else {
        await signInMagicLink(email.trim())
        setOk('Enviamos um link de acesso para o seu e-mail. Abra-o neste aparelho para entrar.')
      }
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card card">
        <div className="login-brand">🍽️ Ficha Técnica &amp; CMV</div>
        <div className="muted-sm mb">Entre para acessar as fichas técnicas da sua empresa.</div>

        <div className="tabs mb" role="tablist">
          <button className={modo === 'entrar' ? 'active' : ''} onClick={() => { setModo('entrar'); setErro(null); setOk(null) }}>Entrar</button>
          <button className={modo === 'criar' ? 'active' : ''} onClick={() => { setModo('criar'); setErro(null); setOk(null) }}>Criar conta</button>
          <button className={modo === 'magic' ? 'active' : ''} onClick={() => { setModo('magic'); setErro(null); setOk(null) }}>Link por e-mail</button>
        </div>

        {erro && <div className="msg-erro" role="alert">⚠️ {erro}</div>}
        {ok && <div className="msg-ok">✅ {ok}</div>}

        <form onSubmit={submit}>
          <div className="mb">
            <label>E-mail</label>
            <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@empresa.com" />
          </div>
          {modo !== 'magic' && (
            <div className="mb">
              <label>Senha</label>
              <input
                type="password"
                autoComplete={modo === 'criar' ? 'new-password' : 'current-password'}
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                placeholder="Mínimo 6 caracteres"
              />
            </div>
          )}
          <button type="submit" className="btn primary lg" style={{ width: '100%' }} disabled={loading}>
            {loading
              ? 'Aguarde…'
              : modo === 'entrar'
                ? 'Entrar'
                : modo === 'criar'
                  ? 'Criar conta'
                  : 'Enviar link de acesso'}
          </button>
        </form>

        {modo === 'entrar' && (
          <div className="muted-sm mt" style={{ textAlign: 'center' }}>
            Esqueceu a senha? Use “Link por e-mail” para entrar sem senha.
          </div>
        )}
      </div>
    </div>
  )
}
