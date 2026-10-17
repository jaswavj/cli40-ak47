import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { usersApi, usersData, usersError } from '../../../api/users/users-api-service';
import ListPagination, { DEFAULT_PAGE_SIZE } from '../../components/ListPagination';
import '../master/Master.css';

type Attender = { id: number; name: string; code: string; isActive: number };

const AttenderPage: React.FC = () => {
  const [rows, setRows] = useState<Attender[]>([]);
  const [page, setPage] = useState(0);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [editId, setEditId] = useState(0);
  const [blockIt, setBlockIt] = useState(false);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    try {
      setRows(usersData<Attender[]>(await usersApi.attenders()) || []);
    } catch (err) {
      toast.error(usersError(err, 'Could not load attenders'));
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    setPage(0);
  }, [search]);

  const reset = () => {
    setName('');
    setCode('');
    setEditId(0);
    setBlockIt(false);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.warning('Attender name is required');
      return;
    }
    setBusy(true);
    try {
      if (editId && blockIt) {
        await usersApi.blockAttender(editId);
        toast.info('Attender blocked successfully');
      } else {
        await usersApi.saveAttender({
          id: editId || undefined,
          name: name.trim(),
          code: code.trim(),
        });
        toast.success(editId ? 'Attender updated successfully' : 'Attender added successfully');
      }
      reset();
      await refresh();
    } catch (err) {
      toast.error(usersError(err, 'Save failed'));
    } finally {
      setBusy(false);
    }
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rows.filter((r) => [r.name, r.code].join(' ').toLowerCase().includes(q));
  }, [rows, search]);

  const pageRows = filtered.slice(page * DEFAULT_PAGE_SIZE, (page + 1) * DEFAULT_PAGE_SIZE);

  return (
    <div className="mst-page">
      <h2 className="mst-title">
        <i className="fas fa-user-tie" /> Attender
      </h2>
      <div className="mst-grid">
        <div className="mst-card">
          <div className="mst-card-h">
            <span>
              <i className="fas fa-plus-circle" /> {editId ? 'Edit Attender' : 'Add New Attender'}
            </span>
          </div>
          <form className="mst-card-b mst-form one-col" onSubmit={onSubmit}>
            <div className="mst-fg">
              <label>
                Attender Name <span className="req">*</span>
              </label>
              <input className="mst-inp" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </div>
            <div className="mst-fg">
              <label>Code</label>
              <input className="mst-inp" value={code} onChange={(e) => setCode(e.target.value)} />
            </div>
            {editId > 0 && (
              <label className="mst-block mst-check">
                <input type="checkbox" checked={blockIt} onChange={(e) => setBlockIt(e.target.checked)} />
                Block this attender
              </label>
            )}
            <div className="mst-actions">
              <button className="mst-btn mst-btn-primary" disabled={busy} type="submit">
                <i className="fas fa-save" /> {editId ? 'Update' : 'Add Attender'}
              </button>
              {editId > 0 && (
                <button className="mst-btn mst-btn-outline" type="button" onClick={reset}>
                  Cancel
                </button>
              )}
            </div>
          </form>
        </div>
        <div className="mst-card">
          <div className="mst-card-h">
            <span>
              <i className="fas fa-list" /> Attender List
            </span>
            <div className="mst-search">
              <i className="fas fa-search" />
              <input
                className="mst-inp"
                placeholder="Search attender..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="mst-table-wrap">
            <table className="mst-table">
              <thead>
                <tr>
                  <th style={{ width: 50 }}>#</th>
                  <th>Name</th>
                  <th>Code</th>
                  <th style={{ width: 80 }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="mst-empty">
                      No records
                    </td>
                  </tr>
                )}
                {pageRows.map((row, i) => (
                  <tr key={row.id}>
                    <td>{page * DEFAULT_PAGE_SIZE + i + 1}</td>
                    <td>{row.name}</td>
                    <td>{row.code || '—'}</td>
                    <td>
                      <button
                        className="mst-icon-btn"
                        type="button"
                        title="Edit"
                        onClick={() => {
                          setEditId(row.id);
                          setName(row.name);
                          setCode(row.code || '');
                          setBlockIt(false);
                        }}
                      >
                        <i className="fas fa-edit" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ListPagination page={page} size={DEFAULT_PAGE_SIZE} total={filtered.length} onChange={setPage} />
        </div>
      </div>
    </div>
  );
};

export default AttenderPage;
