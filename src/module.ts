///<reference path="../node_modules/grafana-sdk-mocks/app/headers/common.d.ts" />

import _ from 'lodash';
import $ from 'jquery';
import { MetricsPanelCtrl } from 'app/plugins/sdk';
import { transformDataToTable } from './transformers';
import { tablePanelEditor } from './editor';
import { columnOptionsTab } from './column_options';
import { TableRenderer } from './renderer';

class TablePanelCtrl extends MetricsPanelCtrl {
  static templateUrl = 'module.html';

  pageIndex: number;
  currentFilter: string;
  dataRaw: any;
  table: any;
  renderer: any;
  pageCache: any[];
  datasource: any;

  panelDefaults = {
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

  /** @ngInject */
  constructor($scope, $injector, templateSrv, private annotationsSrv, private $sanitize, private variableSrv) {
    super($scope, $injector);

    this.pageIndex = 0;
    this.pageCache = [];

    if (this.panel.styles === void 0) {
      this.panel.styles = this.panel.columns;
      this.panel.columns = this.panel.fields;
      delete this.panel.columns;
      delete this.panel.fields;
    }

    _.defaults(this.panel, this.panelDefaults);

    this.events.on('data-received', this.onDataReceived.bind(this));
    this.events.on('data-error', this.onDataError.bind(this));
    this.events.on('data-snapshot-load', this.onDataReceived.bind(this));
    this.events.on('init-edit-mode', this.onInitEditMode.bind(this));
    this.events.on('init-panel-actions', this.onInitPanelActions.bind(this));
  }

  onInitEditMode() {
    this.addEditorTab('Options', tablePanelEditor, 2);
    this.addEditorTab('Column Styles', columnOptionsTab, 3);
  }

  onInitPanelActions(actions) {
    actions.push({ text: 'Export CSV', click: 'ctrl.exportCsv()' });
  }

  issueQueries(datasource) {

    this.pageIndex = 0;
    this.datasource = datasource;

    if (this.panel.transform === 'annotations') {
      this.setTimeQueryStart();
      return this.annotationsSrv.getAnnotations({ dashboard: this.dashboard, panel: this.panel, range: this.range })
        .then(annotations => {
          return { data: annotations };
        });
    }

    return this._issueQueries(true);
  }

  _rowsCount() {
    if (!this.datasource) {
      return Promise.resolve(0);
    }

    let panel = this.panel;

    if (panel.limit) {
      return this.$q.when(this.panel.limit);
    }

    if (panel.rowsCount !== null) {
      return this.$q.when(panel.rowsCount);
    }

    let q = panel.targets[0].rawSql;
    if (q === "" || q === undefined) {
      return this.$q.when(0);
    }

    q = this._rmWhere(q);
    q = this._rmOrder(q);
    q = this._rmOffset(q, false);
    q = this._rmLimit(q, false);

    q = "select count(*) from (" + q + ") as T";
    return this.datasource.metricFindQuery(q).then(
      (data) => {
        panel.rowsCount = data.length ? data[0].text : 0;
        return panel.rowsCount;
      });
  }

  _rmLimit(query, raw) {
    let q = query.toLowerCase();
    let limit = raw ? ('limit ' + this.getLimitStr()) : 'limit $__limit';
    let limitIndex = q.indexOf(limit);
    if (limitIndex === -1) {
      return query;
    }

    return query.slice(0, limitIndex) + query.slice(limitIndex + limit.length, q.length);
  }

  _rmOffset(query, raw) {
    let q = query.toLowerCase();
    let offset = raw ? ('offset ' + this.getLimitStr()) : 'offset $__offset';
    let offsetIndex = q.indexOf(offset);
    if (offsetIndex === -1) {
      return query;
    }

    return query.slice(0, offsetIndex) + query.slice(offsetIndex + offset.length, q.length);
  }

  _rmOrder(query) {
    let q = query.toLowerCase();
    let offset = 'order by $__order';
    let offsetIndex = q.indexOf(offset);
    if (offsetIndex === -1) {
      return query;
    }

    return query.slice(0, offsetIndex) + query.slice(offsetIndex + offset.length, q.length);
  }

  _rmWhere(query) {
    let q = query.toLowerCase().replace(/(\r\n|\n|\r)/gm, " ");

    let result = '';

    let startIndex = q.indexOf('$__where');
    let endIndex;
    let orderByIndex = q.indexOf('order by') - 1;
    let groupByIndex = q.indexOf('group by') - 1;

    if (groupByIndex !== -1) {
      endIndex = orderByIndex < groupByIndex ? orderByIndex : groupByIndex;
    } else {
      endIndex = orderByIndex;
    }

    let itemStr = q.slice(startIndex, endIndex);

    if (!this.panel.filterableColumns) {
      result = ' where (true) ';

    } else if (itemStr.trim().toLowerCase() === '$__where') {
      if (this.currentFilter) {
        result = ' where ' + this._getColumnFilter();
      }
    } else {

      let andIndex = q.indexOf('and');

      if (andIndex !== -1) {
        endIndex = andIndex;
      }

      if (this.currentFilter) {
        result = ' where ' + this._getColumnFilter();
      } else {
        result = ' where (true) ';
      }
    }

    let finalQuery = query.replace(/(\r\n|\n|\r)/gm, " ");

    return finalQuery.slice(0, startIndex) + result + finalQuery.slice(endIndex, finalQuery.length);
  }

  getLimitStr() {
    return this.panel.pageSize;
  }

  getOffsetStr() {
    return this.pageIndex * this.panel.pageSize;
  }

  getOrderStr(orderIndex, desc) {

    if (orderIndex === null) {
      orderIndex = 0;
    }

    let query = this.panel.targets[0].rawSql;
    let q = query.toLowerCase().replace(/(\r\n|\n|\r)/gm, " ");

    let startIndex = q.indexOf('select ') + 'select '.length;
    let endIndex = q.indexOf('from') - 1;

    let itemStr = query.replace(/(\r\n|\n|\r)/gm, " ").slice(startIndex, endIndex);
    let items = itemStr.split(',');

    for (let index = 0; index < items.length; index++) {
      let element = items[index].trim();
      let loweredElement = element.toLowerCase();
      let caseIndex = loweredElement.indexOf('case');
      let aliasIndex = loweredElement.indexOf(' as ');
      let aliasStartIndex = aliasIndex + ' as '.length;

      if (caseIndex !== -1) {
        let alias = element.slice(aliasStartIndex, element.length);
        items[index] = alias;
      } else if (aliasIndex !== -1) {
        let alias = element.slice(aliasStartIndex, element.length);
        items[index] = alias;
      } else {
        items[index] = element;
      }
    }

    let item = items[orderIndex];
    let result = item + ' ';
    if (desc) {
      result = result + 'DESC';
    } else {
      result = result + 'ASC';
    }

    return result;
  }

  getWhereStr() {
    let query = this.panel.targets[0].rawSql;
    let q = query.toLowerCase().replace(/(\r\n|\n|\r)/gm, " ");

    let startIndex = q.indexOf('$__where');
    let endIndex = q.indexOf('order by') - 1;

    let itemStr = query.replace(/(\r\n|\n|\r)/gm, " ").slice(startIndex, endIndex);
    let result = '';

    if (!this.panel.filterableColumns) {
      result = ' where (true) ';

      return result;
    }

    if (itemStr.trim().toLowerCase() === '$__where') {
      if (this.currentFilter) {
        result = ' where ' + this._getColumnFilter();
      }
    } else {

      if (this.currentFilter) {
        result = ' where ' + this._getColumnFilter();
      } else {
        result = ' where (true) ';
      }
    }

    return result;
  }

  _getColumnFilter() {
    if (this.panel.filterableColumns) {
      let columns = this.panel.filterableColumns.split(',');


      let colStr = '';
      let searchParams = this.currentFilter.split(' ');
      columns.forEach((col, index) => {

        if (index !== 0) {
          colStr = colStr + ' or ';
        }

        searchParams.forEach((param, paramIndex) => {
          if (paramIndex !== 0) {
            colStr = colStr + ' or ';
          }

          colStr = colStr + col + " like '%" + param.trim() + "%'";
        });
      });

      return colStr;
    } else {
      return '';
    }
  }

  _issueQueries(clearCache = true) {
    if (!this.panel.targets || this.panel.targets.length === 0) {
      return this.$q.when([]);
    }

    if (clearCache) {
      this.pageCache = [];
      this.panel.rowsCount = null;
    }

    let orderIndex = this.panel.sort.col;
    let desc = this.panel.sort.desc;
    // make shallow copy of scoped vars,
    // and add built in variables interval and interval_ms
    let scopedVars = Object.assign({}, this.panel.scopedVars, {
      "__interval": { text: this.interval, value: this.interval },
      "__interval_ms": { text: this.intervalMs, value: this.intervalMs },
      "__limit": { value: this.getLimitStr() },
      "__offset": { value: this.getOffsetStr() },
      "__order": { value: this.getOrderStr(orderIndex, desc) },
      "__where": { value: this.getWhereStr() },
    });

    let metricsQuery = {
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
  }

  onDataError(err) {
    this.dataRaw = [];
    this.render();
  }

  onDataReceived(dataList) {
    this.dataRaw = dataList;

    // automatically correct transform mode based on data
    if (this.dataRaw && this.dataRaw.length) {
      if (this.dataRaw[0].type === 'table') {
        this.panel.transform = 'table';
      } else {
        if (this.dataRaw[0].type === 'docs') {
          this.panel.transform = 'json';
        } else {
          if (this.panel.transform === 'table' || this.panel.transform === 'json') {
            this.panel.transform = 'timeseries_to_rows';
          }
        }
      }
    }

    this.render();
  }

  render() {
    this.table = transformDataToTable(this.dataRaw, this.panel);
    this.table.sort(this.panel.sort);

    this.renderer = new TableRenderer(this.panel, this.table, this.dashboard.isTimezoneUtc(), this.$sanitize, this.templateSrv);

    return super.render(this.table);
  }

  toggleColumnSort(col, colIndex) {
    this.pageIndex = 0;
    // remove sort flag from current column
    if (this.table.columns[this.panel.sort.col]) {
      this.table.columns[this.panel.sort.col].sort = false;
    }

    if (this.panel.sort.col === colIndex) {
      if (this.panel.sort.desc) {
        this.panel.sort.desc = false;
      } else {
        this.panel.sort.col = null;
      }
    } else {
      this.panel.sort.col = colIndex;
      this.panel.sort.desc = true;
    }

    this.loadPage(true);
  }

  loadPage(clearCache = false) {
    let self = this;
    self._issueQueries(clearCache).then(function (data) { self.handleQueryResult(data); });
  }

  exportCsv() {
    var scope = this.$scope.$new(true);
    scope.tableData = this.renderer.render_values();
    scope.panel = 'table';
    this.publishAppEvent('show-modal', {
      templateHtml: '<export-data-modal panel="panel" data="tableData"></export-data-modal>',
      scope,
      modalClass: 'modal--narrow'
    });
  }

  search() {
    // var el = $(e.currentTarget);

    // this.currentFilter = el.val();
    this.loadPage(true);
  }

  link(scope, elem, attrs, ctrl: TablePanelCtrl) {
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
      let rows = ctrl.pageCache[ctrl.pageIndex];
      tbodyElem.html(ctrl.renderer.render(rows));
    }

    function switchPage(e) {
      var el = $(e.currentTarget);
      ctrl.pageIndex = (parseInt(el.text(), 10) - 1);
      if (ctrl.pageCache[ctrl.pageIndex] === undefined) {
        ctrl.loadPage(true);
      } else {
        renderPanel();
      }
    }

    function appendPaginationControls(footerElem) {
      ctrl._rowsCount().then(rows => {
        footerElem.empty();

        var pageSize = panel.pageSize || 100;
        pageCount = Math.ceil(rows / pageSize);
        if (pageCount === 1) {
          return;
        }

        var startPage = Math.max(ctrl.pageIndex - 3, 0);
        var endPage = Math.min(pageCount, startPage + 9);

        var paginationList = $('<ul></ul>');

        for (var i = startPage; i < endPage; i++) {
          var activeClass = i === ctrl.pageIndex ? 'active' : '';
          var pageLinkElem = $('<li><a class="table-panel-page-link pointer ' + activeClass + '">' + (i + 1) + '</a></li>');
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
      let filterData = $(e.currentTarget).data();
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
  }
}

export {
  TablePanelCtrl,
  TablePanelCtrl as PanelCtrl
};
