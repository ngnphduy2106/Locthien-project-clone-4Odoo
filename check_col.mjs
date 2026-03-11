import fs from 'fs';
const file = 'c:\\Users\\Admin\\.gemini\\antigravity\\scratch\\loc-thien-scm\\public\\js\\app.js';
let content = fs.readFileSync(file, 'utf-8');

// Find the merge section by its unique markers
const startMarker = '<input type="checkbox" id="is-merged-order"';
const endMarker = '</datalist>';
const endMarker2 = '</div>'; // The closing div after datalist

const startIdx = content.indexOf(startMarker);
if (startIdx === -1) { console.log('❌ Start marker not found'); process.exit(1); }

// Find the line start
const lineStart = content.lastIndexOf('\n', startIdx) + 1;

// Find </datalist> after start
const datalistEnd = content.indexOf(endMarker, startIdx);
if (datalistEnd === -1) { console.log('❌ End datalist not found'); process.exit(1); }

// Find the closing </div> after </datalist>
const divEnd = content.indexOf('\n', datalistEnd + endMarker.length);

const oldBlock = content.substring(lineStart, divEnd + 1);
console.log('OLD BLOCK:', oldBlock.substring(0, 100), '...');
console.log('OLD BLOCK LENGTH:', oldBlock.length);

const newBlock = `                    <input type="checkbox" id="is-merged-order" style="width:16px; height:16px;" onchange="
                        const mergeBox = document.getElementById('merge-orders-add-section');
                        if (this.checked) {
                            mergeBox.classList.remove('hidden');
                        } else {
                            mergeBox.classList.add('hidden');
                            document.getElementById('merge-order-tags').innerHTML = '';
                        }
                    ">
                    <label for="is-merged-order" style="font-weight:600; margin:0; cursor:pointer;">🔗 Ghép chung với đơn khác</label>
                </div>
                <div id="merge-orders-add-section" class="hidden" style="margin-top:10px;">
                    <div style="display:flex; gap:6px; align-items:center;">
                        <input type="text" id="merge-order-input" list="merge-order-datalist" class="form-control" placeholder="Gõ mã đơn hoặc tên khách..." style="flex:1;" onkeydown="if(event.key==='Enter'){event.preventDefault();addMergeOrderTag()}">
                        <button type="button" class="btn btn-info btn-sm" onclick="addMergeOrderTag()" style="white-space:nowrap; padding:6px 12px;">+ Thêm</button>
                    </div>
                    <datalist id="merge-order-datalist">
                    \${(() => {
                const validStatuses = ['Chưa thực hiện', 'Đang thực hiện', 'pending', 'assigned', 'delivering', 'Mới'];
                const eligible = Object.values(state.orders).flat().filter(o =>
                    (o.id !== orderId && o.sale_order_no !== orderId) &&
                    validStatuses.includes(o.status)
                );
                const importOrders = Object.values(state.imports || {}).flat().filter(i =>
                    validStatuses.includes(i.status)
                );
                let html = '';
                eligible.forEach(o => {
                    const no = o.sale_order_no || o.id;
                    const cus = o.khach || o.account_name || 'Khách lẻ';
                    html += '<option value="' + no + '">' + cus + '</option>';
                });
                importOrders.forEach(i => {
                    const no = i.ticket_no || i.id;
                    const sup = i.supplier_name || i.supplier || 'Nhà cung cấp';
                    html += '<option value="' + no + '">[Nhập] ' + sup + '</option>';
                });
                return html;
            })()}
                    </datalist>
                    <div id="merge-order-tags" style="display:flex; flex-wrap:wrap; gap:6px; margin-top:8px;"></div>
                </div>
`;

// Replace keeping CRLF
const newBlockCRLF = newBlock.replace(/\n/g, '\r\n');
const contentNew = content.substring(0, lineStart) + newBlockCRLF + content.substring(divEnd + 1);
fs.writeFileSync(file, contentNew);
console.log('✅ Merge UI replaced successfully');
