# Maya memory policy

The target Open Brain (`OB1`) zone is `ob1-pe-finance`. Access requires both Maya's injected principal and `client_id=pe-finance`; zone membership alone is insufficient.

The build package contains no memory credential, service-role key, record, cursor, or stale `ob1-maya` pointer. Memory reads and writes remain disabled until isolation tests prove cross-agent and cross-client denial and the activation receipt names the accepted principal binding.

Every durable claim must retain source provenance. Client-private content remains in the client plane; shared operating knowledge receives pointers only.
