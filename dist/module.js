///<reference path="../node_modules/grafana-sdk-mocks/app/headers/common.d.ts" />
System.register(['lodash', 'jquery', 'app/plugins/sdk', './transformers', './editor', './column_options', './renderer'], function(exports_1) {
    var __extends = (this && this.__extends) || function (d, b) {
        for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
    var lodash_1, jquery_1, sdk_1, transformers_1, editor_1, column_options_1, renderer_1;
    var TablePanelCtrl;
    return {
        setters:[
            function (lodash_1_1) {
                lodash_1 = lodash_1_1;
            },
            function (jquery_1_1) {
                jquery_1 = jquery_1_1;
            },
            function (sdk_1_1) {
                sdk_1 = sdk_1_1;
            },
            function (transformers_1_1) {
                transformers_1 = transformers_1_1;
            },
            function (editor_1_1) {
                editor_1 = editor_1_1;
            },
            function (column_options_1_1) {
                column_options_1 = column_options_1_1;
            },
            function (renderer_1_1) {
                renderer_1 = renderer_1_1;
            }],
        execute: function() {
            TablePanelCtrl = (function (_super) {
                __extends(TablePanelCtrl, _super);
                /** @ngInject */
                function TablePanelCtrl($scope, $injector, templateSrv, annotationsSrv, $sanitize, variableSrv) {
                    _super.call(this, $scope, $injector);
                    this.annotationsSrv = annotationsSrv;
                    this.$sanitize = $sanitize;
                    this.variableSrv = variableSrv;
                    this.panelDefaults = {
                        targets: [{}],
                        transform: 'timeseries_to_columns',
                        pageSize: 100,
                        filterableColumns: null,
                        limit: null,
                        showHeader: true,
                        styles: [
                            {
                                type: 'date',
                                pattern: 'Time',
                                alias: 'Time',
                                dateFormat: 'YYYY-MM-DD HH:mm:ss',
                            },
                            {
                                unit: 'short',
                                type: 'number',
                                alias: '',
                                decimals: 2,
                                colors: ["rgba(245, 54, 54, 0.9)", "rgba(237, 129, 40, 0.89)", "rgba(50, 172, 45, 0.97)"],
                                colorMode: null,
                                pattern: '/.*/',
                                thresholds: [],
                            }
                        ],
                        columns: [],
                        scroll: true,
                        fontSize: '100%',
                        sort: { col: 0, desc: true },
                    };
                    this.pageIndex = 0;
                    this.pageCache = [];
                    if (this.panel.styles === void 0) {
                        this.panel.styles = this.panel.columns;
                        this.panel.columns = this.panel.fields;
                        delete this.panel.columns;
                        delete this.panel.fields;
                    }
                    lodash_1.default.defaults(this.panel, this.panelDefaults);
                    this.events.on('data-received', this.onDataReceived.bind(this));
                    this.events.on('data-error', this.onDataError.bind(this));
                    this.events.on('data-snapshot-load', this.onDataReceived.bind(this));
                    this.events.on('init-edit-mode', this.onInitEditMode.bind(this));
                    this.events.on('init-panel-actions', this.onInitPanelActions.bind(this));
                }
                TablePanelCtrl.prototype.onInitEditMode = function () {
                    this.addEditorTab('Options', editor_1.tablePanelEditor, 2);
                    this.addEditorTab('Column Styles', column_options_1.columnOptionsTab, 3);
                };
                TablePanelCtrl.prototype.onInitPanelActions = function (actions) {
                    actions.push({ text: 'Export CSV', click: 'ctrl.exportCsv()' });
                };
                TablePanelCtrl.prototype.issueQueries = function (datasource) {
                    this.pageIndex = 0;
                    this.datasource = datasource;
                    if (this.panel.transform === 'annotations') {
                        this.setTimeQueryStart();
                        return this.annotationsSrv.getAnnotations({ dashboard: this.dashboard, panel: this.panel, range: this.range })
                            .then(function (annotations) {
                            return { data: annotations };
                        });
                    }
                    return this._issueQueries(true);
                };
                TablePanelCtrl.prototype._rowsCount = function () {
                    if (!this.datasource) {
                        return Promise.resolve(0);
                    }
                    var panel = this.panel;
                    if (panel.limit) {
                        return this.$q.when(this.panel.limit);
                    }
                    if (panel.rowsCount !== null) {
                        return this.$q.when(panel.rowsCount);
                    }
                    var q = panel.targets[0].rawSql;
                    if (q === "" || q === undefined) {
                        return this.$q.when(0);
                    }
                    q = this._rmWhere(q);
                    q = this._rmOrder(q);
                    q = this._rmOffset(q, false);
                    q = this._rmLimit(q, false);
                    q = "select count(*) from (" + q + ") as T";
                    return this.datasource.metricFindQuery(q).then(function (data) {
                        panel.rowsCount = data.length ? data[0].text : 0;
                        return panel.rowsCount;
                    });
                };
                TablePanelCtrl.prototype._rmLimit = function (query, raw) {
                    var q = query.toLowerCase();
                    var limit = raw ? ('limit ' + this.getLimitStr()) : 'limit $__limit';
                    var limitIndex = q.indexOf(limit);
                    if (limitIndex === -1) {
                        return query;
                    }
                    return query.slice(0, limitIndex) + query.slice(limitIndex + limit.length, q.length);
                };
                TablePanelCtrl.prototype._rmOffset = function (query, raw) {
                    var q = query.toLowerCase();
                    var offset = raw ? ('offset ' + this.getLimitStr()) : 'offset $__offset';
                    var offsetIndex = q.indexOf(offset);
                    if (offsetIndex === -1) {
                        return query;
                    }
                    return query.slice(0, offsetIndex) + query.slice(offsetIndex + offset.length, q.length);
                };
                TablePanelCtrl.prototype._rmOrder = function (query) {
                    var q = query.toLowerCase();
                    var offset = 'order by $__order';
                    var offsetIndex = q.indexOf(offset);
                    if (offsetIndex === -1) {
                        return query;
                    }
                    return query.slice(0, offsetIndex) + query.slice(offsetIndex + offset.length, q.length);
                };
                TablePanelCtrl.prototype._rmWhere = function (query) {
                    var q = query.toLowerCase().replace(/(\r\n|\n|\r)/gm, " ");
                    var result = '';
                    var startIndex = q.indexOf('$__where');
                    var endIndex = q.indexOf('order by') - 1;
                    var itemStr = q.slice(startIndex, endIndex);
                    if (!this.panel.filterableColumns) {
                        result = ' where (true) ';
                    }
                    else if (itemStr.trim().toLowerCase() === '$__where') {
                        if (this.currentFilter) {
                            result = ' where ' + this._getColumnFilter();
                        }
                    }
                    else {
                        var andIndex = q.indexOf('and');
                        if (andIndex !== -1) {
                            endIndex = andIndex;
                        }
                        if (this.currentFilter) {
                            result = ' where ' + this._getColumnFilter();
                        }
                        else {
                            result = ' where (true) ';
                        }
                    }
                    var finalQuery = query.replace(/(\r\n|\n|\r)/gm, " ");
                    return finalQuery.slice(0, startIndex) + result + finalQuery.slice(endIndex, finalQuery.length);
                };
                TablePanelCtrl.prototype.getLimitStr = function () {
                    return this.panel.pageSize;
                };
                TablePanelCtrl.prototype.getOffsetStr = function () {
                    return this.pageIndex * this.panel.pageSize;
                };
                TablePanelCtrl.prototype.getOrderStr = function (orderIndex, desc) {
                    if (orderIndex === null) {
                        orderIndex = 0;
                    }
                    var query = this.panel.targets[0].rawSql;
                    var q = query.toLowerCase().replace(/(\r\n|\n|\r)/gm, " ");
                    var startIndex = q.indexOf('select ') + 'select '.length;
                    var endIndex = q.indexOf('from') - 1;
                    var itemStr = query.replace(/(\r\n|\n|\r)/gm, " ").slice(startIndex, endIndex);
                    var items = itemStr.split(',');
                    for (var index = 0; index < items.length; index++) {
                        var element = items[index];
                        var loweredElement = element.toLowerCase();
                        var caseIndex = loweredElement.indexOf('case');
                        if (caseIndex !== -1) {
                            var aliasIndex = loweredElement.indexOf(' as ') + ' as '.length;
                            var alias = element.slice(aliasIndex, element.length);
                            items[index] = alias.trim();
                        }
                        else {
                            items[index] = element.trim();
                        }
                    }
                    var item = items[orderIndex];
                    var result = item + ' ';
                    if (desc) {
                        result = result + 'DESC';
                    }
                    else {
                        result = result + 'ASC';
                    }
                    return result;
                };
                TablePanelCtrl.prototype.getWhereStr = function () {
                    var query = this.panel.targets[0].rawSql;
                    var q = query.toLowerCase().replace(/(\r\n|\n|\r)/gm, " ");
                    var startIndex = q.indexOf('$__where');
                    var endIndex = q.indexOf('order by') - 1;
                    var itemStr = query.replace(/(\r\n|\n|\r)/gm, " ").slice(startIndex, endIndex);
                    var result = '';
                    if (!this.panel.filterableColumns) {
                        result = ' where (true) ';
                        return result;
                    }
                    if (itemStr.trim().toLowerCase() === '$__where') {
                        if (this.currentFilter) {
                            result = ' where ' + this._getColumnFilter();
                        }
                    }
                    else {
                        if (this.currentFilter) {
                            result = ' where ' + this._getColumnFilter();
                        }
                        else {
                            result = ' where (true) ';
                        }
                    }
                    return result;
                };
                TablePanelCtrl.prototype._getColumnFilter = function () {
                    var _this = this;
                    if (this.panel.filterableColumns) {
                        var columns = this.panel.filterableColumns.split(',');
                        var colStr = '';
                        columns.forEach(function (col, index) {
                            if (index !== 0) {
                                colStr = colStr + ' or ';
                            }
                            colStr = colStr + col + " like '%" + _this.currentFilter + "%'";
                        });
                        return colStr;
                    }
                    else {
                        return '';
                    }
                };
                TablePanelCtrl.prototype._issueQueries = function (clearCache) {
                    if (clearCache === void 0) { clearCache = true; }
                    if (!this.panel.targets || this.panel.targets.length === 0) {
                        return this.$q.when([]);
                    }
                    if (clearCache) {
                        this.pageCache = [];
                        this.panel.rowsCount = null;
                    }
                    var orderIndex = this.panel.sort.col;
                    var desc = this.panel.sort.desc;
                    // make shallow copy of scoped vars,
                    // and add built in variables interval and interval_ms
                    var scopedVars = Object.assign({}, this.panel.scopedVars, {
                        "__interval": { text: this.interval, value: this.interval },
                        "__interval_ms": { text: this.intervalMs, value: this.intervalMs },
                        "__limit": { value: this.getLimitStr() },
                        "__offset": { value: this.getOffsetStr() },
                        "__order": { value: this.getOrderStr(orderIndex, desc) },
                        "__where": { value: this.getWhereStr() },
                    });
                    var metricsQuery = {
                        panelId: this.panel.id,
                        range: this.range,
                        rangeRaw: this.range.raw,
                        interval: this.interval,
                        intervalMs: this.intervalMs,
                        targets: this.panel.targets,
                        format: this.panel.renderer === 'png' ? 'png' : 'json',
                        maxDataPoints: this.resolution,
                        scopedVars: scopedVars,
                        cacheTimeout: this.panel.cacheTimeout
                    };
                    return this.datasource.query(metricsQuery);
                };
                TablePanelCtrl.prototype.onDataError = function (err) {
                    this.dataRaw = [];
                    this.render();
                };
                TablePanelCtrl.prototype.onDataReceived = function (dataList) {
                    this.dataRaw = dataList;
                    // automatically correct transform mode based on data
                    if (this.dataRaw && this.dataRaw.length) {
                        if (this.dataRaw[0].type === 'table') {
                            this.panel.transform = 'table';
                        }
                        else {
                            if (this.dataRaw[0].type === 'docs') {
                                this.panel.transform = 'json';
                            }
                            else {
                                if (this.panel.transform === 'table' || this.panel.transform === 'json') {
                                    this.panel.transform = 'timeseries_to_rows';
                                }
                            }
                        }
                    }
                    this.render();
                };
                TablePanelCtrl.prototype.render = function () {
                    this.table = transformers_1.transformDataToTable(this.dataRaw, this.panel);
                    this.table.sort(this.panel.sort);
                    this.renderer = new renderer_1.TableRenderer(this.panel, this.table, this.dashboard.isTimezoneUtc(), this.$sanitize, this.templateSrv);
                    return _super.prototype.render.call(this, this.table);
                };
                TablePanelCtrl.prototype.toggleColumnSort = function (col, colIndex) {
                    this.pageIndex = 0;
                    // remove sort flag from current column
                    if (this.table.columns[this.panel.sort.col]) {
                        this.table.columns[this.panel.sort.col].sort = false;
                    }
                    if (this.panel.sort.col === colIndex) {
                        if (this.panel.sort.desc) {
                            this.panel.sort.desc = false;
                        }
                        else {
                            this.panel.sort.col = null;
                        }
                    }
                    else {
                        this.panel.sort.col = colIndex;
                        this.panel.sort.desc = true;
                    }
                    this.loadPage(true);
                };
                TablePanelCtrl.prototype.loadPage = function (clearCache) {
                    if (clearCache === void 0) { clearCache = false; }
                    var self = this;
                    self._issueQueries(clearCache).then(function (data) { self.handleQueryResult(data); });
                };
                TablePanelCtrl.prototype.exportCsv = function () {
                    var scope = this.$scope.$new(true);
                    scope.tableData = this.renderer.render_values();
                    scope.panel = 'table';
                    this.publishAppEvent('show-modal', {
                        templateHtml: '<export-data-modal panel="panel" data="tableData"></export-data-modal>',
                        scope: scope,
                        modalClass: 'modal--narrow'
                    });
                };
                TablePanelCtrl.prototype.search = function () {
                    // var el = $(e.currentTarget);
                    // this.currentFilter = el.val();
                    this.loadPage(true);
                };
                TablePanelCtrl.prototype.link = function (scope, elem, attrs, ctrl) {
                    var data;
                    var panel = ctrl.panel;
                    var pageCount = 0;
                    function getTableHeight() {
                        var panelHeight = ctrl.height;
                        if (pageCount > 1) {
                            panelHeight -= 26;
                        }
                        return (panelHeight - 31) + 'px';
                    }
                    function appendTableRows(tbodyElem) {
                        ctrl.renderer.setTable(data);
                        tbodyElem.empty();
                        if (ctrl.pageCache[ctrl.pageIndex] === undefined) {
                            ctrl.pageCache[ctrl.pageIndex] = ctrl.table.rows;
                        }
                        var rows = ctrl.pageCache[ctrl.pageIndex];
                        tbodyElem.html(ctrl.renderer.render(rows));
                    }
                    function switchPage(e) {
                        var el = jquery_1.default(e.currentTarget);
                        ctrl.pageIndex = (parseInt(el.text(), 10) - 1);
                        if (ctrl.pageCache[ctrl.pageIndex] === undefined) {
                            ctrl.loadPage(true);
                        }
                        else {
                            renderPanel();
                        }
                    }
                    function appendPaginationControls(footerElem) {
                        ctrl._rowsCount().then(function (rows) {
                            footerElem.empty();
                            var pageSize = panel.pageSize || 100;
                            pageCount = Math.ceil(rows / pageSize);
                            if (pageCount === 1) {
                                return;
                            }
                            var startPage = Math.max(ctrl.pageIndex - 3, 0);
                            var endPage = Math.min(pageCount, startPage + 9);
                            var paginationList = jquery_1.default('<ul></ul>');
                            for (var i = startPage; i < endPage; i++) {
                                var activeClass = i === ctrl.pageIndex ? 'active' : '';
                                var pageLinkElem = jquery_1.default('<li><a class="table-panel-page-link pointer ' + activeClass + '">' + (i + 1) + '</a></li>');
                                paginationList.append(pageLinkElem);
                            }
                            footerElem.append(paginationList);
                        });
                    }
                    // function search(e) {
                    //   var el = $(e.currentTarget);
                    //   ctrl.currentFilter = el.val();
                    //   ctrl.loadPage(true);
                    // }
                    function renderPanel() {
                        var panelElem = elem.parents('.panel');
                        var rootElem = elem.find('.table-panel-scroll');
                        var tbodyElem = elem.find('tbody');
                        var footerElem = elem.find('.table-panel-footer');
                        elem.css({ 'font-size': panel.fontSize });
                        panelElem.addClass('table-panel-wrapper');
                        appendTableRows(tbodyElem);
                        appendPaginationControls(footerElem);
                        rootElem.css({ 'max-height': panel.scroll ? getTableHeight() : '' });
                    }
                    // hook up link tooltips
                    elem.tooltip({
                        selector: '[data-link-tooltip]'
                    });
                    function addFilterClicked(e) {
                        var filterData = jquery_1.default(e.currentTarget).data();
                        var options = {
                            datasource: panel.datasource,
                            key: data.columns[filterData.column].text,
                            value: data.rows[filterData.row][filterData.column],
                            operator: filterData.operator,
                        };
                        ctrl.variableSrv.setAdhocFilter(options);
                    }
                    //elem.on('change', '.searchInput', search);
                    elem.on('click', '.table-panel-page-link', switchPage);
                    elem.on('click', '.table-panel-filter-link', addFilterClicked);
                    var unbindDestroy = scope.$on('$destroy', function () {
                        elem.off('click', '.table-panel-page-link');
                        elem.off('click', '.table-panel-filter-link');
                        unbindDestroy();
                    });
                    ctrl.events.on('render', function (renderData) {
                        data = renderData || data;
                        if (data) {
                            renderPanel();
                        }
                        ctrl.renderingCompleted();
                    });
                };
                TablePanelCtrl.templateUrl = 'module.html';
                return TablePanelCtrl;
            })(sdk_1.MetricsPanelCtrl);
            exports_1("TablePanelCtrl", TablePanelCtrl);
            exports_1("PanelCtrl", TablePanelCtrl);
        }
    }
});
//# sourceMappingURL=module.js.map