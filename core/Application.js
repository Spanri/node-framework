const Container = require("./Container")
const Module = require("./Module")

/**
 * Приложение
 */
class Application {
  /**
   * Инициализировать приложение
   * @param {Container|null} container контейнер зависимостей
   * @param {Array<Module>} modules модули приложения
   * @param {Object} config конфигурация приложения
   */
  constructor(container, modules, config) {
    // Проверить контейнер зависимостей
    if (container && !(container instanceof Container)) {
      throw "Экземпляр контейнера зависимостей не подходит для работы приложения"
    }
    // Проверить наличие подключенных модулей
    if (!modules.length) {
      throw "Для работы приложения необходимо подключить хотя бы один модуль"
    }
    // Проверить наличие подключенных модулей
    if (modules.some(appModule => !(appModule instanceof Module))) {
      throw "Для работы приложения необходимо, чтобы каждый модуль был эксземпляром класса Module"
    }

    // Подключить модули
    this.modules = modules || []
    
    // Установить конфигурацию
    this.config = config || {}

    // Подключить контейнер зависимостей приложения
    this.toPlugContainer(container)
    
    // Подключить логгер
    this.toPlugLogger()

    // Подключить роутер
    this.toPlugRouter()

    // Подключить сервер
    this.toPlugServer()
  }

  /**
   * Маршруты приложения
   * @return {Array}
   */
  get routes() {
    const routes = []

    // Обойти модули
    this.modules.forEach(appModule => {
      const moduleRoutes = appModule.routes || []

      // Обойти маршруты
      moduleRoutes.forEach(route => {
        routes.push({ ...route,  moduleId: appModule.id })
      })
    })

    return routes
  }

  /**
   * Зависимости приложения
   * @return {Object}
   */
  get dependencies() {
    let dependencies = this.coreDependencies

    // Обойти модули
    this.modules.forEach(appModule => {
      const moduleDependencies = appModule.dependencies || {}

      // Добавить зависимости
      dependencies = { ...dependencies, ...moduleDependencies }
    })

    return dependencies
  }

  /**
   * Зависимости ядра фреймворка 
   * @return {Object}
   */
  get coreDependencies() {
    return {
      // Логгер приложения
      "core/Logger": { 
        from: require("./Logger"),
        params: { 
          config: this.config.logger || {}
        } 
      },

      // Роутер приложения
      "core/Router": { 
        from: require("./Router"), 
        params: { 
          routes: this.routes, 
          config: this.config.router || {}
        } 
      },

      // HTTP/HTTPS сервер
      "core/Server": { 
        from: require("./Server"), 
        params: { 
          container: this.container, 
          config: this.config.server || {}
        } 
      },

      // Контекст для обработчиков приложения
      "core/Context": { 
        from: require("./Context"), 
        params: { 
          container: this.container, 
          request: null, 
          response: null, 
          route: null 
        } 
      },

      // Объект запроса
      "core/Request": { from: require("./Request") },
      
      // Объект ответа
      "core/Response": { from: require("./Response") }
    }
  }
  
  /**
   * Запустить приложение
   * @return {Promise}
   */
  run() {
    return new Promise(async resolve => {
      // Запустить сервер
      await this.server.start()

      resolve()
    })
  }

  /**
   * Подключить контейнер зависимостей
   * @param {Container|null}
   */
  toPlugContainer(container) {
    this.container = container || new Container()
    this.container.setBatch(this.dependencies)
  }

  /**
   * Подключить логгер
   */
  toPlugLogger() {
    this.logger = this.container.make("core/Logger")
  }

  /**
   * Подключить роутер
   */
  toPlugRouter() {
    this.router = this.container.make("core/Router")
  }

  /**
   * Подключить сервер
   */
  toPlugServer() {
    this.server = this.container.make("core/Server")

    // Слушать событие обработки запроса сервером
    this.server.on("handle", this.handle.bind(this))

    // Слушать события логирования сервера
    this.server.on("log:info", (message, data) => this.logger.info("server", message, data))
    this.server.on("log:error", (message, data) => this.logger.error("server", message, data))
  }

  /**
   * Обработчик запросов
   * @param {Object} request запрос к серверу
   * @param {Object} response ответ сервера
   */
  async handle(request, response) {
    const route = this.router.getRoute(request)
    const params = { request, response, route }
    const context = this.container.make("core/Context", params)

    // Установить заголовки ответа из маршрута
    response.setHeaders(route.headers)

    // Установить опции ответа из маршрута
    response.setOptions(route.options)

    try {
      // Обработать успешный запрос
      await route.handler.call(null, context)

      // Логировать обработку маршрута
      this.logger.info("application", `Маршрут "${route.id}" успешно обработан`, route)
    } catch {
      // Обработать запрос с ошибкой
      await route.errorHandler.call(null, context)

      // Логировать обработку маршрута
      this.logger.error("application", `Маршрут "${route.id}" обработан с ошибкой`, route)
    }
  }
}

module.exports = Application
