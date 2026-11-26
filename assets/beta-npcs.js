/* NPC Network on Supabase: the GM's NPCs, gangs, relationship lines and the PCs pinned to the map. */
(function () {
  'use strict';
  var sb = SP.sb;
  var ORDER = ['gang', 'npc', 'pc', 'link'];
  var TABLE = { gang: 'npc_gangs', npc: 'npcs', pc: 'npc_map_pcs', link: 'npc_links' };

  class Page extends Component {
    constructor(props) {
      super(props);
      Object.assign(this.state, { npcs: [], gangs: [], pcs: [], links: [], pool: [], loading: true });
      this._pend = {};
      this._paths = {};
      window.addEventListener('beforeunload', (e) => {
        if (Object.keys(this._pend).length) { this.flush(); e.preventDefault(); e.returnValue = ''; }
      });
    }

    async componentDidMount() {
      super.componentDidMount();
      var me = await SP.requireUser('npcs.html');
      if (!me) return;
      if (!me.profile.gm_allowed) { location.replace('characters.html'); return; }
      this.setState({ user: me.user, profile: me.profile, role: 'gm' });
      await this.load();
    }
    onRoleChange() {}
    saveDemo() {}

    async load() {
      var gm = this.state.profile.id, th = this.state.lang !== 'en';
      var res = await Promise.all([
        sb.from('npcs').select('*').eq('gm_id', gm).order('created_at'),
        sb.from('npc_gangs').select('*').eq('gm_id', gm).order('created_at'),
        sb.from('npc_links').select('*').eq('gm_id', gm).order('created_at'),
        sb.from('npc_map_pcs').select('*').eq('gm_id', gm),
        sb.from('sessions').select('id, name').eq('gm_id', gm)
      ]);
      var bad = res.find(function (r) { return r.error; });
      if (bad) return this.setState({ loading: false, toast: SP.err(bad.error, th) });
      var sessions = res[4].data || [], sName = {};
      sessions.forEach(function (x) { sName[x.id] = x.name; });
      var seats = sessions.length ? await sb.from('session_members').select('session_id, characters(id, name, factor, portrait_path)').in('session_id', sessions.map(function (x) { return x.id; })) : { data: [] };
      var pool = [], seen = {};
      (seats.data || []).forEach(function (m) {
        var c = m.characters; if (!c || seen[c.id]) return;
        seen[c.id] = 1;
        pool.push({ id: c.id, name: c.name, factor: c.factor, pic: c.portrait_path ? SP.imageUrl(c.portrait_path) : '', session: sName[m.session_id] || '' });
      });
      var paths = this._paths;
      var npcs = (res[0].data || []).map(function (r) {
        var d = r.data || {};
        paths[r.id] = r.portrait_path || null;
        return { id: r.id, name: r.name, pic: r.portrait_url || '', gang: r.gang_id, x: r.x, y: r.y, role: d.role || '', factor: d.factor || '', notes: d.notes || '', stat: d.stat || null };
      });
      // a PC on the map keeps the name and picture it had; seated characters refresh them
      var pcs = (res[3].data || []).map(function (r) {
        var live = pool.find(function (p) { return p.id === r.character_id; });
        return { id: r.character_id, name: live ? live.name : r.name, factor: live ? live.factor : r.factor, pic: live ? live.pic : r.portrait_url || '', x: r.x, y: r.y };
      });
      this.setState({ loading: false, npcs: npcs, pool: pool, pcs: pcs,
        gangs: (res[1].data || []).map(function (g) { return { id: g.id, name: g.name, color: g.color, x: g.x, y: g.y, w: g.w, h: g.h }; }),
        links: (res[2].data || []).map(function (l) { return { id: l.id, a: l.a, b: l.b, kind: l.kind, note: l.note }; }) });
      setTimeout(() => this.fit(), 0);
    }

    /* the design calls commit / drop after every change; rows go to Supabase in batches, gangs before the NPCs that point at them */
    commit(kind, row) {
      if (!row) return;
      this._pend[kind + ':' + row.id] = { kind: kind, row: row };
      clearTimeout(this._flushT);
      this._flushT = setTimeout(() => this.flush(), 500);
    }
    drop(kind, id) {
      this._pend[kind + ':' + id] = { kind: kind, del: true, id: id };
      clearTimeout(this._flushT);
      this._flushT = setTimeout(() => this.flush(), 200);
    }
    toRow(kind, r) {
      var gm = this.state.profile.id;
      if (kind === 'gang') return { id: r.id, gm_id: gm, name: (r.name || '').slice(0, 60), color: r.color, x: r.x, y: r.y, w: r.w, h: r.h };
      if (kind === 'link') return { id: r.id, gm_id: gm, a: r.a, b: r.b, kind: r.kind, note: (r.note || '').slice(0, 300) };
      if (kind === 'pc') return { gm_id: gm, character_id: r.id, name: (r.name || '').slice(0, 60), portrait_url: r.pic || null, factor: r.factor || null, x: r.x, y: r.y };
      return { id: r.id, gm_id: gm, name: (r.name || '').slice(0, 60), portrait_url: r.pic || null, portrait_path: r.pic ? this._paths[r.id] || null : null,
        gang_id: r.gang || null, x: r.x, y: r.y, data: { role: r.role || '', factor: r.factor || '', notes: r.notes || '', stat: r.stat || null } };
    }
    async flush() {
      if (this._flushing) { this._again = true; return; }
      this._flushing = true;
      var pend = this._pend; this._pend = {};
      var items = Object.keys(pend).map(function (k) { return pend[k]; });
      var failed = [];
      for (var kind of ORDER) {
        var ups = items.filter(function (x) { return x.kind === kind && !x.del; }).map((x) => this.toRow(kind, x.row));
        if (!ups.length) continue;
        var r = await sb.from(TABLE[kind]).upsert(ups, kind === 'pc' ? { onConflict: 'gm_id,character_id' } : undefined);
        if (r.error) failed = failed.concat(items.filter(function (x) { return x.kind === kind && !x.del; }));
        // a picture taken off an NPC leaves storage too
        if (!r.error && kind === 'npc') ups.forEach((u) => { if (!u.portrait_url && this._paths[u.id]) { sb.storage.from('scenes').remove([this._paths[u.id]]); this._paths[u.id] = null; } });
      }
      for (var dk of ORDER.slice().reverse()) {
        var ids = items.filter(function (x) { return x.kind === dk && x.del; }).map(function (x) { return x.id; });
        if (!ids.length) continue;
        var q = sb.from(TABLE[dk]).delete();
        var d = dk === 'pc' ? await q.eq('gm_id', this.state.profile.id).in('character_id', ids) : await q.in('id', ids);
        if (d.error) failed = failed.concat(items.filter(function (x) { return x.kind === dk && x.del; }));
        else if (dk === 'npc') ids.forEach((id) => { if (this._paths[id]) { sb.storage.from('scenes').remove([this._paths[id]]); this._paths[id] = null; } });
      }
      this._flushing = false;
      if (failed.length) {
        failed.forEach((x) => { var k = x.kind + ':' + (x.del ? x.id : x.row.id); if (!this._pend[k]) this._pend[k] = x; });
        this.setState({ toast: this.state.lang !== 'en' ? 'บันทึกไม่สำเร็จ กำลังลองใหม่…' : 'Couldn\'t save, retrying…', saveErr: true });
        clearTimeout(this._flushT);
        this._flushT = setTimeout(() => this.flush(), 4000);
      } else if (this.state.saveErr) this.setState({ toast: '', saveErr: false });
      if (this._again) { this._again = false; this.flush(); }
    }

    /* a duplicated NPC gets its own copy of the picture, so deleting one never breaks the other */
    async dupPic(fromId, toId) {
      var src = this._paths[fromId];
      if (!src) return;
      var dst = this.state.profile.id + '/npc/' + toId + '-' + Date.now().toString(36) + (src.slice(src.lastIndexOf('.')) || '.jpg');
      var r = await sb.storage.from('scenes').copy(src, dst);
      if (r.error) { this.editNpc(toId, { pic: '' }); return; }
      this._paths[toId] = dst;
      this.editNpc(toId, { pic: sb.storage.from('scenes').getPublicUrl(dst).data.publicUrl });
    }

    async pickPic(id, file) {
      var th = this.state.lang !== 'en';
      this.setState({ toast: th ? 'กำลังอัปโหลดรูป…' : 'Uploading…' });
      try {
        var blob = await SP.fitImage(file, 900);
        var path = this.state.profile.id + '/npc/' + id + '-' + Date.now().toString(36) + (blob.type === 'image/webp' ? '.webp' : '.jpg');
        var up = await sb.storage.from('scenes').upload(path, blob, { contentType: blob.type, cacheControl: '31536000' });
        if (up.error) throw up.error;
        var old = this._paths[id];
        this._paths[id] = path;
        this.editNpc(id, { pic: sb.storage.from('scenes').getPublicUrl(path).data.publicUrl });
        if (old) sb.storage.from('scenes').remove([old]);
        this.setState({ toast: '' });
      } catch (e) { this.setState({ toast: SP.imageErr(e, th) }); }
    }

    renderVals() {
      var v = super.renderVals();
      var th = this.state.lang !== 'en';
      SP.menuVals(this, v);
      if (this.state.loading) v.countLabel = th ? 'กำลังโหลด…' : 'LOADING…';
      return v;
    }
  }
  Page.pageKind = 'GMTables';
  DC.mount(Page, document.getElementById('app'));
})();
