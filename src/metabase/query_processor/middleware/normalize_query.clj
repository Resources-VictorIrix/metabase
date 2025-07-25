(ns metabase.query-processor.middleware.normalize-query
  "Middleware that converts a query into a normalized, canonical form."
  (:require
   [metabase.lib.core :as lib]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.store :as qp.store]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(defn- normalize*
  [query]
  (let [metadata-provider (or (when-let [existing (:lib/metadata query)]
                                (when (lib.metadata.protocols/metadata-provider? existing)
                                  existing))
                              (qp.store/metadata-provider))]
    ;; removing `:lib/converted?` will keep MLv2 from doing a bunch of extra transformations to something that's already
    ;; a well-formed pMBQL query, we don't need that and it actually ends up breaking some stuff
    ;; TODO: Get the library to a stable state, where `lib/query` is idempotent, then this can be dropped.
    (lib/query metadata-provider (dissoc query :lib.convert/converted?))))

(mu/defn normalize-preprocessing-middleware :- ::lib.schema/query
  "Preprocessing middleware. Normalize a query, meaning do things like convert keys and MBQL clause tags to kebab-case
  keywords. Convert query to pMBQL if needed."
  [query :- [:map [:database ::lib.schema.id/database]]]
  (try
    (u/prog1 (normalize* query)
      (log/tracef "Normalized query:\n%s\n=>\n%s" (u/pprint-to-str query) (u/pprint-to-str <>)))
    (catch Throwable e
      (throw (ex-info (format "Error normalizing query: %s" (ex-message e))
                      {:type  qp.error-type/qp
                       :query query}
                      e)))))
