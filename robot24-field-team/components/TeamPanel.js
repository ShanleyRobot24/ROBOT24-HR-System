'use client';
import { useState } from 'react';
import { useAuth } from './AuthProvider';
import { groupBy, sortRegions, money, fmtDate, daysUntil } from '@/lib/format';
import ContractorDrawer from './ContractorDrawer';
import Avatar from './Avatar';
import { usePhotoUrls } from '@/lib/photos';
import { dayRateOf } from '@/lib/rates';

function passportState(docs) {
  const p = docs.filter((d) => d.doc_type === 'passport').sort((a, b) => (b.expires_on || '').localeCompare(a.expires_on || ''))[0];
  if (!p) return ['Missing', 'alert'];
  if (!p.expires_on) return ['On file', 'ok'];
  const n = daysUntil(p.expires_on);
  if (n < 0) return [`Expired ${fmtDate(p.expires_on)}`, 'alert'];
  if (n < 180) return [`Expires ${fmtDate(p.expires_on)}`, 'warn'];
  return ['On file', 'ok'];
}

export default function TeamPanel({ contractors, documents, refresh }) {
  const { isAdmin } = useAuth();
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState(undefined); // undefined closed, null new person
  const [showInactive, setShowInactive] = useState(false);

  const list = contractors.filter((c) => (showInactive || c.active) && (!q || `${c.full_name} ${c.ref_code || ''} ${c.region} ${c.city || ''}`.toLowerCase().includes(q.toLowerCase())));
  const groups = groupBy(list, 'region');
  const regions = Object.keys(groups).sort(sortRegions);
  const docsFor = (id) => documents.filter((d) => d.contractor_id === id);
  const photos = usePhotoUrls(contractors.map((c) => c.photo_path));

  return (
    <>
      <div className="toolbar">
        <input className="search" placeholder="Search name, reference, location" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="check"><input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Show inactive</label>
        <span className="spacer" />
        {isAdmin && <button className="btn primary" onClick={() => setOpenId(null)}>Add field team member</button>}
      </div>
      {!isAdmin && <p className="hint">You can add addresses and upload contracts, passports and IDs. Only an admin can change other details or add people.</p>}

      {regions.map((r) => (
        <section key={r} className="region">
          <h2>{r}<span className="count">{groups[r].length}</span></h2>
          <div className="table-wrap">
            <table className="team-table" data-tour="records">
              <thead>
                <tr><th>Name</th><th>Role</th><th className="r">Day rate</th><th>Contract</th><th>Passport</th><th>Address</th><th>Kit</th></tr>
              </thead>
              <tbody>
                {groups[r].map((c) => {
                  const docs = docsFor(c.id);
                  const contracts = docs.filter((d) => d.doc_type === 'contract').length;
                  const [pp, ppTone] = passportState(docs);
                  return (
                    <tr key={c.id} onClick={() => setOpenId(c.id)} className={c.active ? '' : 'inactive'}>
                      <td><div className="who-cell"><Avatar name={c.full_name} url={photos[c.photo_path]} size={36} /><div><strong>{c.full_name}</strong><span className="sub2 ref">{c.ref_code}</span></div></div></td>
                      <td>{c.designation}{c.city && <span className="sub2">{c.city}</span>}</td>
                      <td className="r num-cell rates">
                        {(() => { const d = dayRateOf(c); return d.rate ? <><span>{money(d.rate, c.currency)}</span>{d.estimated && <span className="chip warn">Estimated</span>}</> : <span className="chip alert">No day rate</span>; })()}
                      </td>
                      <td>
                        <span className={`chip ${c.contract_signed ? 'ok' : 'alert'}`}>{c.contract_signed ? 'Signed' : 'Not signed'}</span>
                        <span className="sub2">{contracts ? `${contracts} file${contracts > 1 ? 's' : ''}` : 'No file'}</span>
                      </td>
                      <td><span className={`chip ${ppTone}`}>{pp}</span></td>
                      <td>{c.address_line1 ? <span className="okc">On file</span> : <span className="muted">Missing</span>}</td>
                      <td className="kit-cell"><span>Shirt: {c.tshirt_status || 'n/a'}</span><span>Mic: {c.mic_sponge_status || 'n/a'}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      {openId !== undefined && (
        <ContractorDrawer
          team={contractors}
          key={openId || 'new'}
          contractor={openId ? contractors.find((c) => c.id === openId) : null}
          documents={openId ? docsFor(openId) : []}
          onClose={() => setOpenId(undefined)}
          onCreated={(id) => setOpenId(id)}
          refresh={refresh}
        />
      )}
    </>
  );
}
